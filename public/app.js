import { autoResolve, checkTimes, DEFAULT_MEALS } from "/scheduler.js";
import { parseInstructions } from "/instructions.js";
import {
  generatePlanTasks,
  preparePlanTasks,
  validateDatedTasks,
} from "/care-plan.js";
import {
  RECORD_KEY,
  emptyRecord,
  recordTask,
  updateCaregiver,
  localInput,
  timeCandidates,
} from "/record.js";
import { createRecordStore } from "/record-store.js";
import { createRecovery } from "/recovery.js";

/* =========================================================================
   CareLoop — compact blue interface
   Parsing, scheduling and record checks run deterministically in the browser.
   ========================================================================= */

const LS = RECORD_KEY;
const recordStore = createRecordStore();
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
let reviewFlags = [],
  unreadLines = [];
let lastSaved,
  lastToken = null,
  busy = false,
  draftToken = null,
  draftLoaded = false,
  draftDirty = false;
const validDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value || "") &&
  localISO(new Date(value + "T12:00:00")) === value;

function localISO(d) {
  const y = d.getFullYear(),
    m = String(d.getMonth() + 1).padStart(2, "0"),
    day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

let S = emptyRecord();

/* =======================================================================
   1. COMPILER — constraint placement, hand-written
   ======================================================================= */

function compileSchedule(meds, requested = {}) {
  return autoResolve(meds, S.meals || DEFAULT_MEALS, requested);
}
function rebuildTasks(candidate) {
  const result = preparePlanTasks(S, candidate, localISO(new Date()));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  candidate.history = result.history;
  return result.tasks;
}
function resolutionHTML(schedule) {
  if (!schedule.ok)
    return schedule.violations
      .map((v) => `<div class="banner"><b>Not saved.</b> ${esc(v.msg)}</div>`)
      .join("");
  return schedule.adjustments.length
    ? `<div class="banner green"><b>Automatically resolved</b>${schedule.adjustments.map((a) => `<div>${esc(a.drug)}: ${esc(a.before.join(", "))} → <b>${esc(a.after.join(", "))}</b> · ${esc(a.reason)}</div>`).join("")}</div>`
    : '<div class="small">The entered timing rules fit. No changes needed.</div>';
}
function generateTasks(state, days = 30) {
  return generatePlanTasks(state, days);
}

/* =======================================================================
   2. RUNTIME CHECKS — against what actually happened
   ======================================================================= */

function findLogViolations(state) {
  const out = [];
  const done = state.tasks.filter(
    (t) => t.kind === "med" && t.status === "done" && t.doneAt,
  );
  const byMed = {};
  done.forEach((t) => {
    (byMed[t.medId] = byMed[t.medId] || []).push(t);
  });

  Object.entries(byMed).forEach(([medId, list]) => {
    list.sort((a, b) => a.doneAt - b.doneAt);
    const med = state.meds.find((m) => m.id === medId);
    for (let i = 1; i < list.length; i++) {
      const gap = (list[i].doneAt - list[i - 1].doneAt) / 60000;
      const exact = med?.freq.match(/^every (\d+) hours$/);
      const need = exact ? Number(exact[1]) * 60 : 60;
      if (gap < need)
        out.push({
          kind: "duplicate",
          a: list[i - 1],
          b: list[i],
          msg: `${med?.drug || "?"} recorded twice, ${Math.round(gap)} min apart. ${exact ? `The instruction requires ${need} min.` : "Check for a duplicate record; this is not a dosing recommendation."} Contact the care team for dose advice; future doses have not been changed.`,
        });
    }
  });

  const all = [...done].sort((a, b) => a.doneAt - b.doneAt);
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const A = all[i],
        B = all[j];
      if (A.medId === B.medId) continue;
      const ma = state.meds.find((m) => m.id === A.medId),
        mb = state.meds.find((m) => m.id === B.medId);
      if (!ma || !mb) continue;
      const need = Math.max(
        !ma.gapTarget || ma.gapTarget.toLowerCase() === mb.drug.toLowerCase()
          ? Number(ma.gapH || 0)
          : 0,
        !mb.gapTarget || mb.gapTarget.toLowerCase() === ma.drug.toLowerCase()
          ? Number(mb.gapH || 0)
          : 0,
      );
      const gap = (B.doneAt - A.doneAt) / 60000;
      if (need && gap < need * 60)
        out.push({
          kind: "interval",
          a: A,
          b: B,
          msg: `${ma.drug} and ${mb.drug} were recorded ${Math.round(gap)} min apart; the entered rule requires ${need * 60} min. Check whether the records are accurate. For dose advice, contact the care team; future doses have not been changed.`,
        });
    }
  return out;
}

function findMissed(state, graceMin = 60) {
  const today = localISO(new Date());
  return state.tasks
    .filter((t) => t.kind === "med" && t.status === "todo" && t.date === today)
    .filter(
      (t) =>
        (Date.now() -
          (t.dueAt ?? new Date(t.date + "T" + t.time + ":00").getTime())) /
          60000 >
        graceMin,
    )
    .map((t) => {
      const late = Math.floor(
        (Date.now() -
          (t.dueAt ?? new Date(t.date + "T" + t.time + ":00").getTime())) /
          60000,
      );
      return {
        task: t,
        lateMin: late,
        msg: `${t.time} ${esc(t.label)} still open — ${Math.floor(late / 60)}h ${late % 60}m past due.`,
      };
    });
}

function computeLoad(state) {
  const groups = state.team.map((person) => ({
    name: person.name + (person.archived ? " (removed)" : ""),
    rel: person.rel,
    tasks: state.tasks.filter((task) => task.who === person.id),
  }));
  const unassigned = state.tasks.filter(
    (task) => !state.team.some((person) => person.id === task.who),
  );
  if (unassigned.length)
    groups.push({ name: "Unassigned", rel: "—", tasks: unassigned });
  return groups.map((group) => ({
    ...group,
    total: group.tasks.length,
    done: group.tasks.filter((task) => task.status === "done").length,
    pending: group.tasks.filter((task) => task.status === "todo").length,
    skipped: group.tasks.filter((task) => task.status === "skip").length,
  }));
}

/* =======================================================================
   3. DOCUMENT READER — deterministic, offline, validated
   ======================================================================= */

const SAMPLE_TEXT = `DISCHARGE SUMMARY - HEART FAILURE
Patient: Nguyen Thi Hoa   Age: 71   Discharged: 2026-10-23
Primary language: Vietnamese

MEDICATIONS
Furosemide 40 mg by mouth once daily in the morning.
Metoprolol succinate 50 mg by mouth twice daily with food.
Lisinopril 10 mg by mouth once daily, at least 2 hours apart from Furosemide.
Atorvastatin 40 mg by mouth at bedtime.

FOLLOW UP
Cardiology in 7 days.
Primary care in 14 days.

MONITORING
Weigh every morning before breakfast.

CALL THE DOCTOR IF
Weight gain more than 2-3 lb in one day or 5 lb in one week.
Increased shortness of breath.
Swelling in the legs gets worse.

GO TO EMERGENCY IF
Chest pain, fainting, or severe shortness of breath.`;

const FREQ_ALLOWED = [
  "once daily",
  "twice daily",
  "three times daily",
  "every 8 hours",
  "every 6 hours",
  "every 12 hours",
  "at bedtime",
  "in the morning",
];

function validateRead(obj) {
  const e = [];
  if (!obj || typeof obj !== "object")
    return { ok: false, errors: ["not an object"] };
  if (!Array.isArray(obj.meds)) e.push("meds must be an array");
  (obj.meds || []).forEach((m, i) => {
    if (!m.drug) e.push(`med[${i}] missing drug`);
    if (!m.dose) e.push(`med[${i}] missing dose`);
    const f = String(m.freq || "")
      .toLowerCase()
      .trim();
    if (!FREQ_ALLOWED.includes(f))
      e.push(`med[${i}] frequency "${esc(m.freq)}" not allowed`);
    if (m.gapH != null && (isNaN(+m.gapH) || +m.gapH < 0))
      e.push(`med[${i}] bad gapH`);
  });
  return { ok: e.length === 0, errors: e };
}

async function readDischarge(text) {
  const data = parseLocal(text);
  const v = validateRead(data);
  return {
    data,
    source: "built-in parser",
    note: v.ok ? "" : "check: " + v.errors.join("; "),
  };
}

function parseLocal(text) {
  return parseInstructions(text, localISO(new Date()));
}

/* =======================================================================
   4. STATE / RENDER
   ======================================================================= */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
function notify(message, error = false) {
  const status = $("#saveStatus");
  status.textContent = message;
  status.classList.toggle("error", error);
}
function acceptSnapshot(snapshot) {
  S = snapshot.record;
  lastToken = snapshot.token;
  lastSaved = structuredClone(S);
}
async function save(candidate, expectedToken = lastToken) {
  if (busy) return false;
  busy = true;
  try {
    acceptSnapshot(await recordStore.replace(candidate, expectedToken));
    notify("");
    return true;
  } catch (error) {
    try {
      acceptSnapshot(recordStore.read());
    } catch {
      if (lastSaved) S = structuredClone(lastSaved);
    }
    notify(error.message, true);
    return false;
  } finally {
    busy = false;
  }
}
function load() {
  try {
    acceptSnapshot(recordStore.read());
  } catch (error) {
    notify(
      "The saved record could not be opened. It has not been deleted.",
      true,
    );
  }
}
function synchronize() {
  if (busy) return;
  try {
    const latest = recordStore.read();
    if (latest.token === lastToken) return;
    acceptSnapshot(latest);
    renderAll();
    if (!S.patient) {
      $("#task-dialog")?.close();
      clearDraft();
    } else if (draftLoaded && !draftDirty) openSavedPlan(false);
    else if (draftLoaded)
      notify(
        "Another tab updated the record. Your draft is unchanged; reload the saved plan before saving.",
        true,
      );
  } catch (error) {
    notify(error.message, true);
  }
}
window.addEventListener("storage", (event) => {
  if (event.key === LS || event.key === null) synchronize();
});
window.addEventListener("focus", synchronize);
function clearDraft() {
  draftLoaded = false;
  draftDirty = false;
  draftToken = lastToken;
  reviewFlags = [];
  unreadLines = [];
  $("#reviewBox").style.display = "none";
  $("#rawText").value = "";
  $("#parseStatus").textContent = "";
  $("#genStatus").textContent = "";
}
function openSavedPlan(scroll = true) {
  if (!S.patient) return;
  $("#rawText").value = S.rawText || "";
  fillReview(
    {
      patient: S.patient,
      meds: S.meds,
      followups: S.followups,
      flags: S.flags,
      unread: S.unread || [],
      reviewedUnread: S.reviewedUnread,
      weigh: S.weigh,
      symptoms: S.symptoms,
    },
    scroll,
  );
}
async function replaceSnapshot(record, token) {
  if (!(await save(record, token)))
    throw new Error($("#saveStatus").textContent);
  renderAll();
}
const recovery = createRecovery({
  snapshot: () => recordStore.read(),
  replace: replaceSnapshot,
  notify,
  afterChange: () => {
    clearDraft();
    renderAll();
    if (S.patient) openSavedPlan(false);
  },
});

async function seed() {
  if (busy) return false;
  if (S.patient && !confirm("Replace this plan with the fictional sample?"))
    return false;
  const parsed = parseLocal(SAMPLE_TEXT),
    candidate = emptyRecord();
  Object.assign(candidate, {
    patient: parsed.patient,
    meds: parsed.meds,
    followups: parsed.followups,
    flags: parsed.flags,
    team: [
      { id: "t1", name: "Lan", rel: "daughter" },
      { id: "t2", name: "Minh", rel: "son" },
      { id: "t3", name: "Amy", rel: "granddaughter" },
    ],
    rawText: SAMPLE_TEXT,
  });
  candidate.schedule = autoResolve(candidate.meds, candidate.meals);
  candidate.tasks = generateTasks(candidate, 30);
  for (const task of candidate.tasks
    .filter((t) => t.date === candidate.patient.dischargeDate)
    .slice(0, 2)) {
    task.status = "done";
    task.doneAt = task.dueAt;
    task.recordedBy = task.who;
    task.recordedByName =
      candidate.team.find((p) => p.id === task.who)?.name || "";
  }
  const saved = await save(candidate);
  if (saved) clearDraft();
  return saved;
}

function renderAll() {
  $("#btnReloadPlan").hidden = !S.patient;
  renderHome();
  renderSchedule();
  renderTasks();
  renderTeam();
  scrollTables();
}

function taskRows(tasks, { assignments = false } = {}) {
  return tasks
    .map((t) => {
      const who = S.team.find((p) => p.id === t.who);
      const future = t.date > localISO(new Date());
      const pending = t.status === "todo";
      return `<article class="task-row" data-task="${esc(t.id)}">
      <div class="task-time">${esc(t.time)}</div>
      <div class="task-description"><h3>${esc(t.label)}</h3>
        <p>${t.kind === "visit" ? "Booking deadline · " : ""}${esc(who?.name || "Unassigned")}${t.doneAt != null ? ` · Recorded ${esc(new Date(t.doneAt).toLocaleString())}${t.recordedByName ? " by " + esc(t.recordedByName) : ""}` : ""}</p>
        ${
          assignments
            ? `<label class="assignment">Assigned to<select aria-label="Assign ${esc(t.label)} at ${esc(t.time)}" data-who="${esc(t.id)}"><option value="">Unassigned</option>${S.team
                .filter((p) => !p.archived || p.id === t.who)
                .map(
                  (p) =>
                    `<option value="${esc(p.id)}" ${p.id === t.who ? "selected" : ""}>${esc(p.name)}${p.archived ? " (removed)" : ""}</option>`,
                )
                .join("")}</select></label>`
            : ""
        }
      </div>
      <div class="task-actions"><span class="pill ${esc(t.status)}">${pending ? "Pending" : t.status === "done" ? "Completed" : "Skipped"}</span>
        ${future ? '<span class="small">Available on this date</span>' : `<button class="mini" ${pending ? "data-done" : "data-edit"}="${esc(t.id)}">${pending ? (t.kind === "med" ? "Record dose" : "Record task") : "Edit record"}</button>${pending ? `<button class="mini" data-skip="${esc(t.id)}">Skip</button>` : ""}`}
      </div></article>`;
    })
    .join("");
}
function wireTaskRows(host) {
  host
    .querySelectorAll("[data-done],[data-edit],[data-skip]")
    .forEach((button) => {
      button.onclick = () =>
        openTask(
          button.dataset.done || button.dataset.edit || button.dataset.skip,
          button.hasAttribute("data-skip")
            ? "skip"
            : button.hasAttribute("data-done")
              ? "done"
              : null,
        );
    });
  host.querySelectorAll("[data-who]").forEach((select) => {
    select.onchange = async () => {
      const candidate = structuredClone(S);
      const task = candidate.tasks.find((t) => t.id === select.dataset.who);
      if (!task) return;
      task.who = select.value;
      await save(candidate);
      renderAll();
    };
  });
}
function renderHome() {
  const completedOpen = $(".completed-tasks")?.open || false;
  const warnings = $("#patientWarnings");
  warnings.hidden = !S.patient || !S.flags.length;
  warnings.innerHTML = S.flags.length
    ? "<b>From the discharge instructions</b>" +
      S.flags.map((flag) => `<div>${esc(flag)}</div>`).join("")
    : "";
  $("#hdrPat").textContent = S.patient
    ? `${S.patient.name} · discharged ${S.patient.dischargeDate}`
    : "";
  $("#todayTasks").innerHTML = "";
  $("#homeAlerts").innerHTML = "";
  $("#nextCard").style.display = "none";
  if (!S.patient) {
    $("#homeSub").textContent = "A clear next step for care at home.";
    $("#homeStats").innerHTML =
      `<div class="empty-state"><div class="eyebrow">Welcome to CareLoop</div><h3>From discharge instructions to a daily routine.</h3><p>Add the instructions, check the details, and review your care plan. Then record what happened, one task at a time.</p><div class="task-actions"><button class="act" id="btnEmptyImport">Add instructions</button><button class="ghost" id="btnEmptySample">Try a sample family</button></div><p class="small">The sample is fictional. Your records stay in this browser.</p></div>`;
    $("#btnEmptySample").onclick = async () => {
      if (await seed()) renderAll();
    };
    $("#btnEmptyImport").onclick = () => navigate("import");
    return;
  }
  const today = localISO(new Date());
  const tasks = S.tasks
    .filter((t) => t.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));
  const pending = tasks.filter((t) => t.status === "todo");
  const finished = tasks.filter((t) => t.status !== "todo");
  const next = pending[0];
  $("#homeSub").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  $("#homeStats").innerHTML = tasks.length
    ? `<span><b>${finished.filter((t) => t.status === "done").length} of ${tasks.length}</b> completed</span><span>${pending.length} pending · ${finished.filter((t) => t.status === "skip").length} skipped</span>`
    : "";
  const missed = findMissed(S);
  const logV = findLogViolations(S);
  const unassigned = pending.filter(
    (t) => !S.team.some((p) => p.id === t.who && !p.archived),
  );
  let alerts = (S.schedule?.violations || [])
    .map(
      (v) =>
        `<div class="banner"><b>Review the schedule</b><div>${esc(v.msg)}</div></div>`,
    )
    .join("");
  alerts += logV
    .map(
      (v) =>
        `<div class="banner"><b>Check a recorded time</b><div>${esc(v.msg)}</div></div>`,
    )
    .join("");
  if (missed.length)
    alerts += `<div class="banner amber"><b>${missed.length} medication task${missed.length === 1 ? " is" : "s are"} past the scheduled time</b><div>Check what happened and record the actual time. For missed-dose advice, contact your care team.</div></div>`;
  if (unassigned.length)
    alerts += `<div class="banner amber"><b>${unassigned.length} pending task${unassigned.length === 1 ? " needs" : "s need"} a caregiver</b><button class="text-button" id="reviewAssignments">Review assignments</button></div>`;
  $("#homeAlerts").innerHTML = alerts
    ? `<h3 class="section-title">Needs attention</h3>${alerts}`
    : "";
  if ($("#reviewAssignments"))
    $("#reviewAssignments").onclick = () => navigate("tasks");
  if (next) {
    $("#nextCard").style.display = "block";
    $("#nextHeading").textContent = "Next pending task · " + next.time;
    $("#nextTitle").textContent = next.label;
    const who = S.team.find((p) => p.id === next.who);
    $("#nextWho").textContent = who
      ? `Assigned to ${who.name}${who.rel ? " · " + who.rel : ""}`
      : "No caregiver assigned";
    $("#btnNextDone").textContent =
      next.kind === "med" ? "Record dose" : "Record task";
    $("#btnNextDone").onclick = () => openTask(next.id, "done");
    $("#btnNextSkip").onclick = () => openTask(next.id, "skip");
  }
  $("#todayTasks").innerHTML = tasks.length
    ? `${pending.length > 1 ? `<h3 class="section-title">Also today <span>${pending.length - 1}</span></h3><div class="task-list">${taskRows(pending.slice(1))}</div>` : ""}${!pending.length ? '<div class="quiet-state"><h3>Today’s tasks are recorded.</h3><p>You can review or correct an entry below.</p></div>' : ""}${finished.length ? `<details class="completed-tasks" ${completedOpen ? "open" : ""}><summary>Recorded today · ${finished.length}</summary><div class="task-list">${taskRows(finished)}</div></details>` : ""}`
    : '<div class="quiet-state"><h3>No tasks planned for today.</h3><p>Open the 30-Day Plan to review the dates covered by your plan.</p><button class="ghost" id="openPlanDates">View 30-Day Plan</button></div>';
  if ($("#openPlanDates"))
    $("#openPlanDates").onclick = () => navigate("tasks");
  wireTaskRows($("#todayTasks"));
}

function scheduleGroups(state, date) {
  const groups = new Map();
  state.tasks
    .filter((t) => t.kind === "med" && t.date === date)
    .sort((a, b) => a.time.localeCompare(b.time))
    .forEach((t) => {
      if (!groups.has(t.time)) groups.set(t.time, []);
      groups.get(t.time).push(t);
    });
  return `<div class="schedule-groups">${
    [...groups]
      .map(
        ([time, tasks]) =>
          `<section class="schedule-group"><h3>${esc(time)}</h3><div>${tasks
            .map((t) => {
              const med = state.meds.find((m) => m.id === t.medId);
              const rules = [
                med?.meal && med.meal !== "any"
                  ? `${med.meal} ${med.mealTarget && med.mealTarget !== "any" ? med.mealTarget : "food"}`
                  : "",
                med?.gapH
                  ? `At least ${med.gapH} hours from ${med.gapTarget || "other medicines"}`
                  : "",
              ].filter(Boolean);
              return `<div class="scheduled-med"><h4>${esc(med?.drug || t.label)} <span>${esc(med?.dose || "")}</span></h4><p>${esc(rules.join(" · ") || med?.freq || "")}</p></div>`;
            })
            .join("")}</div></section>`,
      )
      .join("") ||
    '<p class="sub">No medications on this date. Checks and booking deadlines are in the 30-Day Plan.</p>'
  }</div>`;
}

function renderSchedule() {
  const host = $("#scheduleBody");
  if (!S.meds.length || !S.schedule) {
    host.innerHTML =
      '<span class="small">Add instructions to build a care plan first.</span>';
    return;
  }
  const bad = S.schedule.bad || {};
  const scheduleDate = S.tasks.some(
    (task) => task.date === localISO(new Date()),
  )
    ? localISO(new Date())
    : S.patient.dischargeDate;
  const displayTimes = Object.fromEntries(
    S.meds.map((m) => [
      m.id,
      S.tasks
        .filter(
          (task) =>
            task.kind === "med" &&
            task.medId === m.id &&
            task.date === scheduleDate,
        )
        .map((task) => task.time),
    ]),
  );

  const rows = S.meds
    .map((m) => {
      const ts = (displayTimes[m.id] || []).join(", ") || "—";
      return `<tr class="${bad[m.id] ? "conflict" : ""}">
      <td><b>${esc(m.drug)}</b><div class="small">${esc(m.dose)}</div></td>
      <td>${esc(m.freq)}</td>
      <td>${m.meal === "with" ? "with food" : m.meal === "before" ? "before food" : m.meal === "after" ? "after food" : "—"}</td>
      <td>${m.gapH ? esc(m.gapH) + " h from " + esc(m.gapTarget || "all others") : "—"}</td>
      <td class="mono"><b>${esc(ts)}</b></td></tr>`;
    })
    .join("");

  const viol = S.schedule.violations || [];
  host.innerHTML = `
    ${scheduleGroups(S, scheduleDate)}
    <div class="small" style="margin:8px 0 12px">
      Schedule for ${esc(scheduleDate)}.
      ${viol.length ? "Review the timing alerts below." : "Times checked against the supported instructions."}</div>
    ${resolutionHTML(S.schedule)}
    <details class="timing-details">
      <summary>View timing details</summary>
      <table><thead><tr><th>Drug</th><th style="width:130px">How often</th><th style="width:110px">Meal</th>
      <th style="width:140px">Spacing</th><th style="width:150px">Scheduled time</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </details>
    <div class="card hd">
      <div class="small">Recheck this saved plan while keeping the entered doses and timing rules.</div>
      <div style="margin-top:9px">
        <button class="act" id="btnRecompile">Check and adjust times</button>
        <details class="example-tools"><summary>Try a timing example</summary><p class="small">A demonstration only. Your saved plan will not change.</p><button class="ghost" id="btnTestMove">Try a conflict example</button></details>
      </div>
      <div class="small" id="recompMsg" style="margin-top:8px"></div>
    </div>`;

  $("#btnRecompile").onclick = async () => {
    if (busy) return;
    const resolved = compileSchedule(S.meds, S.schedule.times);
    if (!resolved.ok) {
      $("#recompMsg").innerHTML = resolutionHTML(resolved);
      return;
    }
    const candidate = { ...S, schedule: resolved };
    try {
      candidate.tasks = rebuildTasks(candidate);
    } catch (error) {
      $("#recompMsg").textContent = error.message;
      return;
    }
    if (await save(candidate)) renderAll();
  };
  $("#btnTestMove").onclick = () => {
    const spaced = S.meds.find((m) => Number(m.gapH) > 0);
    if (!spaced) {
      $("#recompMsg").textContent = "Add a spacing rule to try this example.";
      return;
    }
    const anchor = S.meds.find(
      (m) =>
        m.id !== spaced.id &&
        (!spaced.gapTarget ||
          m.drug.toLowerCase() === spaced.gapTarget.toLowerCase()),
    );
    if (!anchor) {
      $("#recompMsg").textContent =
        "Choose the other medication in the spacing rule.";
      return;
    }
    const requested = structuredClone(S.schedule.times);
    requested[spaced.id][0] = requested[anchor.id][0];
    requested[spaced.id].sort();
    const resolved = compileSchedule(S.meds, requested);
    const caught = checkTimes(S.meds, requested, S.meals || DEFAULT_MEALS);
    $("#recompMsg").innerHTML =
      "<p><b>Example only · saved plan unchanged.</b></p>" +
      caught.map((v) => `<div class="small">${esc(v.msg)}</div>`).join("") +
      resolutionHTML(resolved);
  };
}

function renderTasks() {
  const host = $("#taskList"),
    sub = $("#taskSub");
  if (!S.tasks.length) {
    sub.textContent = "Add instructions to build a care plan first.";
    host.innerHTML = "";
    $("#conflictBox").innerHTML = "";
    $("#dayFilter").innerHTML = "";
    return;
  }
  const dates = [...new Set(S.tasks.map((t) => t.date))].sort();
  const sel = $("#dayFilter");
  const cur =
    sel.value && dates.includes(sel.value)
      ? sel.value
      : dates.includes(localISO(new Date()))
        ? localISO(new Date())
        : dates[0];
  sub.textContent = `${S.tasks.length} doses and checks over ${dates.length} days`;

  const v = findLogViolations(S);
  $("#conflictBox").innerHTML = v.length
    ? v
        .map(
          (x) =>
            `<div class="banner"><b>Rule break in the record</b> — ${esc(x.msg)}</div>`,
        )
        .join("")
    : '<div class="banner green"><b>Log matches the rules.</b> No dose was logged too close to another.</div>';

  $("#btnAllDays").onclick = () => show(dates);
  sel.onchange = () => show([sel.value]);
  show([cur]);

  function show(list) {
    sel.innerHTML = dates
      .map(
        (d) =>
          `<option value="${d}" ${list.includes(d) ? "selected" : ""}>${d}</option>`,
      )
      .join("");
    host.innerHTML = list
      .map(
        (date) =>
          `<section class="plan-day"><h3 class="section-title">${esc(new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }))}</h3><div class="task-list">${taskRows(
            S.tasks
              .filter((t) => t.date === date)
              .sort((a, b) => a.time.localeCompare(b.time)),
            { assignments: true },
          )}</div></section>`,
      )
      .join("");
    wireTaskRows(host);
  }
}

function renderTeam() {
  $("#caregiverList").innerHTML = S.team
    .filter((person) => !person.archived)
    .map(
      (person) =>
        `<div class="caregiver-edit" data-person="${esc(person.id)}"><label>Name<input data-name value="${esc(person.name)}" maxlength="100"></label><label>Relationship<input data-relation value="${esc(person.rel || "")}" maxlength="100"></label><button class="mini" data-person-save="${esc(person.id)}">Save</button><button class="mini" data-person-remove="${esc(person.id)}">Remove</button></div>`,
    )
    .join("");
  const box = $("#teamCard");
  if (!S.tasks.length) {
    box.innerHTML =
      '<span class="small">Add instructions to build a care plan first.</span>';
    return;
  }
  const load = computeLoad(S);
  box.innerHTML = `<div class="team-overview">${load.map((l) => `<article class="team-person"><div><h3>${esc(l.name)}</h3><p>${esc(l.rel === "—" ? "Choose a caregiver in the 30-Day Plan" : l.rel)}</p></div><div><b>${l.pending}</b> pending<span>${l.done} completed · ${l.skipped} skipped</span></div></article>`).join("")}</div>`;
}

/* =======================================================================
   5. WIRING
   ======================================================================= */

function navigate(id) {
  const button = document.querySelector(`nav [data-t="${id}"]`);
  $$("nav button").forEach((b) => {
    b.classList.toggle("on", b === button);
    if (b === button) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  $$(".panel").forEach((p) => p.classList.toggle("on", p.id === "p-" + id));
  $("#moreNav").open = false;
  $("#moreNav").classList.toggle(
    "active",
    ["import", "tasks", "about"].includes(id),
  );
  $("#moreCurrent").textContent = ["import", "tasks", "about"].includes(id)
    ? " · " + button.textContent
    : "";
  if (id === "import" && S.patient && !draftLoaded) openSavedPlan(false);
  if (id === "home") renderHome();
  if (id === "schedule") renderSchedule();
  scrollTables();
  const heading = $("#p-" + id + " h2");
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
$$("nav button").forEach((b) => (b.onclick = () => navigate(b.dataset.t)));
document.addEventListener("click", (event) => {
  if (!event.target.closest("#moreNav")) $("#moreNav").open = false;
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("#moreNav").open) {
    $("#moreNav").open = false;
    $("#moreNav summary").focus();
  }
});

$("#btnDemo").onclick = () => {
  $("#rawText").value = SAMPLE_TEXT;
  $("#parseStatus").textContent = "Sample discharge summary loaded.";
};

$("#btnParse").onclick = async () => {
  const text = $("#rawText").value.trim();
  if (!text) {
    $("#parseStatus").textContent = "Paste or load a summary first.";
    return;
  }
  $("#parseStatus").textContent = "Reading…";
  const res = await readDischarge(text);
  fillReview(res.data);
  const gaps = res.data.meds.filter((m) => m.gapH).length;
  $("#parseStatus").innerHTML =
    `<b>${res.source}</b>${res.note ? " — " + res.note : ""}
    <span class="small">(${res.data.meds.length} drugs, ${gaps} timing rule${gaps === 1 ? "" : "s"}, ${res.data.flags.length} red flags)</span>`;
};

$("#btnManual").onclick = () => {
  fillReview({
    patient: {
      name: "",
      age: "",
      dischargeDate: localISO(new Date()),
      lang: "en",
    },
    meds: [],
    followups: [],
    flags: [],
  });
  $("#parseStatus").textContent = "Manual entry.";
};

const FREQ_OPTS = [
  "once daily",
  "twice daily",
  "three times daily",
  "every 8 hours",
  "every 6 hours",
  "every 12 hours",
  "at bedtime",
  "in the morning",
];
const MEAL_OPTS = [
  ["any", "—"],
  ["with", "with food"],
  ["before", "before food"],
  ["after", "after food"],
];

function fillReview(d, scroll = true) {
  draftToken = lastToken;
  draftLoaded = true;
  draftDirty = false;
  $("#reviewBox").style.display = "block";
  reviewFlags = d.flags || [];
  unreadLines = d.unread || [];
  $("#readWarnings").innerHTML = unreadLines.length
    ? `<div class="banner"><b>Not read:</b>${unreadLines.map((line) => `<div>${esc(line)}</div>`).join("")}<label class="ck"><input id="ackUnread" type="checkbox">I entered these instructions manually below.</label></div>`
    : "";
  if (d.reviewedUnread && $("#ackUnread")) $("#ackUnread").checked = true;
  if (typeof d.weigh === "boolean") $("#fWeigh").checked = d.weigh;
  if (typeof d.symptoms === "boolean") $("#fSymptoms").checked = d.symptoms;
  $("#fWarnings").value = reviewFlags.join("\n");
  $("#fName").value = d.patient?.name || "";
  $("#fAge").value = d.patient?.age || "";
  $("#fDate").value = d.patient?.dischargeDate || localISO(new Date());
  $("#fLang").value = d.patient?.lang || "en";
  for (const key of Object.keys(DEFAULT_MEALS))
    $("#meal-" + key).value = (S.meals || DEFAULT_MEALS)[key];
  const tb = $("#medTable tbody");
  tb.innerHTML = "";
  (d.meds || []).forEach((m) => addMedRow(m));
  if (!(d.meds || []).length) addMedRow();
  const fb = $("#fuTable tbody");
  fb.innerHTML = "";
  (d.followups || []).forEach((f) => addFuRow(f));
  if (!(d.followups || []).length) addFuRow();
  if (scroll)
    $("#reviewBox").scrollIntoView({ behavior: "smooth", block: "start" });
}

function addMedRow(m = {}) {
  const tr = document.createElement("tr");
  tr.dataset.medId = m.id || "";
  tr.dataset.issue = m.issue || "";
  tr.dataset.mealTarget = m.mealTarget || "any";
  tr.dataset.source = m.source || "";
  tr.innerHTML = `
    <td><input type="text" class="mDrug" value="${esc(m.drug || "")}" placeholder="Furosemide">${m.issue ? `<div class="small">${esc(m.issue)}<label class="ck"><input class="mReviewed" type="checkbox">Reviewed</label></div>` : ""}</td>
    <td><input type="text" class="mDose" value="${esc(m.dose || "")}" placeholder="40 mg"></td>
    <td><select class="mFreq"><option value="" ${!m.freq ? "selected" : ""}>Choose frequency</option>${FREQ_OPTS.map((f) => `<option ${f === m.freq ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></td>
    <td><select class="mMeal">${MEAL_OPTS.map(([v, l]) => `<option value="${v}" ${v === (m.meal || "any") ? "selected" : ""}>${esc(m.mealTarget && m.mealTarget !== "any" && v === m.meal ? l.replace("food", m.mealTarget) : l)}</option>`).join("")}</select></td>
    <td><input type="text" class="mTarget" value="${esc(m.gapTarget || "")}" placeholder="All other medicines"></td>
    <td><input type="number" class="mGap" value="${esc(m.gapH ?? "")}" placeholder="—" min="0" step="1"></td>
    <td><button class="mini remove-row" type="button" aria-label="Remove row">×</button></td>`;
  const labels = [
    "Medication",
    "Dose",
    "How often",
    "Meal",
    "Separate from",
    "Gap (hours)",
    "Remove",
  ];
  [...tr.cells].forEach((cell, index) => {
    cell.dataset.label = labels[index];
    const field = cell.querySelector("input,select");
    if (field) field.setAttribute("aria-label", labels[index]);
  });
  $("#medTable tbody").appendChild(tr);
}
document.addEventListener("click", (event) => {
  if (event.target.closest(".remove-row")) event.target.closest("tr").remove();
});
$("#btnAddMed").onclick = () => addMedRow();
$("#medTable").addEventListener("change", (event) => {
  if (event.target.matches(".mMeal"))
    event.target.closest("tr").dataset.mealTarget = "any";
});

function addFuRow(f = {}) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="fWho" value="${esc(f.who || "")}" placeholder="Cardiology"></td>
    <td><input type="number" class="fDays" min="0" max="365" value="${esc(f.days ?? 7)}"></td>
    <td><button class="mini remove-row" type="button" aria-label="Remove row">×</button></td>`;
  tr.querySelector(".fWho").setAttribute("aria-label", "Follow-up provider");
  tr.querySelector(".fDays").setAttribute(
    "aria-label",
    "Booking deadline in days",
  );
  $("#fuTable tbody").appendChild(tr);
}
$("#btnAddFu").onclick = () => addFuRow();

$("#btnGenerate").onclick = async () => {
  if (busy) return;
  if (draftToken !== lastToken) {
    const message =
      "Another tab changed the record. Reload the saved plan before saving this draft.";
    notify(message, true);
    $("#genStatus").textContent = message;
    $("#genStatus").scrollIntoView({ block: "nearest" });
    return;
  }
  const name = $("#fName").value.trim();
  const date = $("#fDate").value.trim();
  const errors = [];
  if (!name) errors.push("Enter the patient name.");
  if (!validDate(date))
    errors.push("Enter a valid discharge date (YYYY-MM-DD).");
  if (unreadLines.length && !$("#ackUnread")?.checked)
    errors.push("Review the instructions that were not read.");
  const meds = $$("#medTable tbody tr")
    .map((tr, i) => {
      const drug = tr.querySelector(".mDrug").value.trim();
      if (!drug) {
        errors.push("Enter a medication name or remove the empty row.");
        return null;
      }
      if (tr.dataset.issue && !tr.querySelector(".mReviewed")?.checked)
        errors.push(`${drug}: review the unsupported wording.`);
      const dose = tr.querySelector(".mDose").value.trim(),
        freq = tr.querySelector(".mFreq").value;
      const old = S.meds.find(
        (m) =>
          m.drug.toLowerCase() === drug.toLowerCase() &&
          m.dose === dose &&
          m.freq === freq,
      );
      const g = tr.querySelector(".mGap").value;
      return {
        id: old?.id || "m-" + crypto.randomUUID(),
        drug,
        dose,
        freq,
        meal: tr.querySelector(".mMeal").value,
        gapH: g === "" ? null : Number(g),
        gapTarget: tr.querySelector(".mTarget").value.trim(),
        mealTarget: tr.dataset.mealTarget || "any",
        source: tr.dataset.source || "",
      };
    })
    .filter(Boolean);
  const followups = $$("#fuTable tbody tr")
    .map((tr, i) => {
      const who = tr.querySelector(".fWho").value.trim(),
        raw = tr.querySelector(".fDays").value;
      if (!who) return null;
      if (
        raw === "" ||
        !Number.isInteger(Number(raw)) ||
        +raw < 0 ||
        +raw > 365
      )
        errors.push(`${who}: enter a follow-up deadline from 0 to 365 days.`);
      return {
        id:
          S.followups.find((f) => f.who === who)?.id ||
          "f-" + crypto.randomUUID(),
        who,
        days: Number(raw),
      };
    })
    .filter(Boolean);
  const meals = Object.fromEntries(
    Object.keys(DEFAULT_MEALS).map((key) => [key, $("#meal-" + key).value]),
  );
  if (errors.length) {
    $("#genStatus").textContent = errors.join(" ");
    return;
  }
  const resolved = autoResolve(meds, meals);
  if (!resolved.ok) {
    $("#genStatus").innerHTML = resolutionHTML(resolved);
    return;
  }
  const candidate = {
    ...S,
    patient: {
      name,
      age: $("#fAge").value,
      dischargeDate: date,
      lang: $("#fLang").value,
    },
    meds,
    followups,
    flags: $("#fWarnings")
      .value.split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    rawText: $("#rawText").value,
    unread: [...unreadLines],
    reviewedUnread: !unreadLines.length || $("#ackUnread")?.checked,
    meals,
    weigh: $("#fWeigh").checked,
    symptoms: $("#fSymptoms").checked,
    schedule: resolved,
  };
  if (!candidate.team.length)
    candidate.team = [{ id: "self", name: "Me", rel: "self" }];
  try {
    candidate.tasks = rebuildTasks(candidate);
  } catch (error) {
    $("#genStatus").textContent = error.message;
    return;
  }
  const token = draftToken;
  const dialog = document.createElement("dialog");
  dialog.id = "plan-preview";
  dialog.setAttribute("aria-labelledby", "preview-title");
  dialog.innerHTML = `<h2 id="preview-title">Check your care plan</h2><p class="sub">${esc(candidate.patient.name)} · 30 days from ${esc(date)}. Review these times against the written instructions before saving.</p>${scheduleGroups(candidate, date)}${resolutionHTML(resolved)}<p class="small">${candidate.tasks.length} medication tasks, checks, and booking deadlines. ${S.patient ? "Your recorded history will be kept." : "Nothing has been saved yet."}</p><p id="preview-error" role="alert"></p><div class="dialog-actions"><button class="act" id="btnSavePlan">Save care plan</button><button class="ghost" id="btnBackToReview">Back to details</button></div>`;
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  $("#btnBackToReview").onclick = () => dialog.close();
  $("#btnSavePlan").onclick = async () => {
    if (busy) return;
    if (!(await save(candidate, token))) {
      $("#preview-error").textContent = $("#saveStatus").textContent;
      return;
    }
    draftToken = lastToken;
    draftDirty = false;
    $("#genStatus").textContent = "";
    dialog.close();
    renderAll();
    navigate("schedule");
    notify("Care plan saved. Open Today to record care.");
  };
  dialog.showModal();
};

$("#btnSeed").onclick = async () => {
  if (await seed()) {
    renderAll();
    notify("Fictional sample loaded.");
  }
};
$("#btnReset").onclick = () => {
  try {
    recovery.openDelete();
  } catch (error) {
    notify(error.message, true);
  }
};
$("#btnBackup").onclick = () => {
  try {
    recovery.openExport();
  } catch (error) {
    notify(error.message, true);
  }
};
$("#backupImport").onchange = (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (file)
    recovery.openImport(file).catch((error) => notify(error.message, true));
};
$("#btnReloadPlan").onclick = () => {
  if (!draftDirty || confirm("Discard this draft and reopen the saved plan?")) {
    synchronize();
    openSavedPlan();
    notify("Saved plan reopened.");
  }
};
$("#p-import").addEventListener("input", () => {
  draftDirty = true;
});
$("#p-import").addEventListener("change", () => {
  draftDirty = true;
});
$("#caregiverAdd").onsubmit = async (event) => {
  event.preventDefault();
  if (busy) return;
  const form = event.target;
  try {
    const candidate = updateCaregiver(S, {
      name: form.elements.name.value,
      rel: form.elements.rel.value,
      newId: crypto.randomUUID(),
    });
    if (await save(candidate)) {
      form.reset();
      renderTeam();
      notify("Caregiver added.");
    }
  } catch (error) {
    notify(error.message, true);
  }
};
$("#caregiverList").onclick = async (event) => {
  const button = event.target.closest(
    "[data-person-save],[data-person-remove]",
  );
  if (!button || busy) return;
  const id = button.dataset.personSave || button.dataset.personRemove,
    row = button.closest("[data-person]");
  if (
    button.dataset.personRemove &&
    !confirm(
      "Remove this caregiver? Pending future assignments will become unassigned; recorded names stay in history.",
    )
  )
    return;
  try {
    const candidate = updateCaregiver(S, {
      id,
      name: row.querySelector("[data-name]").value,
      rel: row.querySelector("[data-relation]").value,
      remove: !!button.dataset.personRemove,
    });
    if (await save(candidate)) {
      renderAll();
      notify("Caregivers updated.");
    }
  } catch (error) {
    notify(error.message, true);
  }
};

function openTask(id, intent = null) {
  if (busy) return;
  const task = structuredClone(S.tasks.find((t) => t.id === id));
  if (!task) return;
  const token = lastToken,
    initialStatus = task.status,
    originalTime = task.doneAt || Date.now(),
    displayTime = localInput(originalTime);
  const dialog = document.createElement("dialog");
  dialog.id = "task-dialog";
  dialog.setAttribute("aria-labelledby", "record-title");
  const active = S.team.filter((person) => !person.archived);
  dialog.innerHTML = `<form id="record-form"><h2 id="record-title">${esc(task.label)}</h2><p class="small">Scheduled ${esc(task.date)} · ${esc(task.time)}</p><label class="field">Status<select name="status"><option value="done">Completed</option><option value="skip">Skipped</option><option value="todo">Pending</option></select></label><label class="field">Recorded by<select name="recordedBy" required><option value="">Choose a name</option>${active.map((person) => `<option value="${esc(person.id)}">${esc(person.name)}</option>`).join("")}</select></label><label class="field" id="actual-field">Actual time (device time)<input name="actualAt" type="datetime-local" required value="${esc(displayTime)}"></label><label class="field" id="clock-choice" hidden>Repeated clock time<select name="occurrence"></select></label><label class="field">${initialStatus === "todo" ? "Note (optional)" : "Reason for correction"}<textarea name="note" rows="2" maxlength="2000">${esc(task.note || "")}</textarea></label>${task.corrections?.length ? `<details><summary>Corrections (${task.corrections.length})</summary>${task.corrections.map((change) => `<p class="small">${esc(new Date(change.at).toLocaleString())} · ${esc(change.by)}: ${esc(change.before.status)} → ${esc(change.after.status)}<br>${esc(change.before.doneAt ? new Date(change.before.doneAt).toLocaleString() : "No recorded time")} → ${esc(change.after.doneAt ? new Date(change.after.doneAt).toLocaleString() : "No recorded time")}<br>${esc(change.reason)}</p>`).join("")}</details>` : ""}<p id="record-error" role="alert"></p><div class="dialog-actions"><button class="act" type="submit">Save record</button><button class="ghost" type="button" data-cancel>Cancel</button></div></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector("form");
  form.elements.status.value =
    intent || (initialStatus === "todo" ? "done" : initialStatus);
  form.elements.recordedBy.value =
    task.recordedBy && active.some((p) => p.id === task.recordedBy)
      ? task.recordedBy
      : "";
  function updateTime() {
    const pending = form.elements.status.value === "todo";
    form.querySelector("#actual-field").hidden = pending;
    form.elements.actualAt.required = !pending;
    form.elements.actualAt.disabled = pending;
    const candidates = timeCandidates(form.elements.actualAt.value);
    const choice = form.querySelector("#clock-choice");
    choice.hidden = pending || candidates.length < 2;
    form.elements.occurrence.innerHTML = candidates
      .map(
        (epoch, index) =>
          `<option value="${epoch}">${index === 0 ? "First" : "Second"} occurrence · UTC${new Date(epoch).getTimezoneOffset() <= 0 ? "+" : "-"}${Math.abs(new Date(epoch).getTimezoneOffset() / 60)}</option>`,
      )
      .join("");
    if (candidates.includes(originalTime - (originalTime % 60000)))
      form.elements.occurrence.value = String(
        originalTime - (originalTime % 60000),
      );
  }
  form.elements.note.addEventListener("input", () => {
    form.elements.note.dataset.edited = "true";
  });
  form.addEventListener("change", (event) => {
    if (["status", "actualAt"].includes(event.target.name)) updateTime();
  });
  updateTime();
  dialog.querySelector("[data-cancel]").onclick = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove());
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const error = form.querySelector("#record-error");
    error.textContent = "";
    try {
      if (token !== lastToken)
        throw new Error(
          "Another tab changed the record. Cancel and reopen this task before saving.",
        );
      const input = form.elements.actualAt.value,
        candidates = timeCandidates(input);
      const chosenTime =
        candidates.length > 1
          ? Number(form.elements.occurrence.value)
          : candidates[0];
      const actualAt =
        input === displayTime &&
        chosenTime === originalTime - (originalTime % 60000)
          ? originalTime
          : chosenTime;
      if (form.elements.status.value !== "todo" && !candidates.length)
        throw new Error(
          "This time does not exist in the device’s clock. Enter the actual time.",
        );
      if (
        form.elements.status.value !== "todo" &&
        validateDatedTasks(
          S,
          S.tasks.filter((task) => task.date >= localISO(new Date())),
        ).length
      )
        throw new Error(
          "The saved timetable needs review. Open Plan and choose Check and adjust times before recording; existing records have not changed.",
        );
      const candidate = recordTask(S, {
        id,
        status: form.elements.status.value,
        actualAt,
        recordedBy: form.elements.recordedBy.value,
        note: form.elements.note.value,
        reason:
          initialStatus === "todo" ||
          form.elements.note.dataset.edited === "true"
            ? form.elements.note.value
            : "",
      });
      if (await save(candidate, token)) {
        dialog.close();
        renderAll();
      } else throw new Error($("#saveStatus").textContent);
    } catch (problem) {
      error.textContent = problem.message;
      error.tabIndex = -1;
      error.focus();
    }
  };
  dialog.showModal();
}

load();
if (S.patient && S.tasks.length) {
  renderAll();
} else {
  renderHome();
}

if (location.protocol !== "file:" && "serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});

function scrollTables() {
  for (const table of document.querySelectorAll("table")) {
    if (!table.closest(".table-scroll")) {
      const scroll = document.createElement("div");
      scroll.className = "table-scroll";
      table.before(scroll);
      scroll.append(table);
    }
  }
}
scrollTables();

let lastDisplayedDate = localISO(new Date());
function refreshClock() {
  synchronize();
  if (!S.patient) return;
  const date = localISO(new Date());
  renderHome();
  if (date !== lastDisplayedDate) {
    renderSchedule();
    scrollTables();
    lastDisplayedDate = date;
  }
}
setInterval(refreshClock, 30000);
window.addEventListener("focus", refreshClock);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshClock();
});
