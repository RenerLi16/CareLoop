import { createSetupWizard } from "/setup.js";
import {
  homeQueue,
  taskDue,
  timingStatus,
  resolveRemaining,
} from "/live-schedule.js";
import { observeMedicineTimeline } from "/timeline.js";
import { createLanguageControl, translateInterfaceText } from "/i18n.js";
import { autoResolve, DEFAULT_MEALS, FREQUENCIES } from "/scheduler.js";
import { parseInstructions } from "/instructions.js";
import { generatePlanTasks, preparePlanTasks } from "/care-plan.js";
import {
  RECORD_KEY,
  isTaskExpired,
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
  draftDirty = false,
  draftStartAt = null;
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
let queueClockTimer;
let setupWizard;

/* =======================================================================
   1. COMPILER — constraint placement, hand-written
   ======================================================================= */

const toMin = (hhmm) => {
  const p = hhmm.split(":");
  return Number(p[0]) * 60 + Number(p[1]);
};
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
    ? `<div class="banner green"><b>Automatically resolved</b>${schedule.adjustments.map((a) => `<div>${esc(a.drug)}: ${esc(a.before.join(", "))} → <b>${esc(a.after.join(", "))}</b> · <span>${esc(a.reason)}</span></div>`).join("")}</div>`
    : '<div class="small">The entered timing rules fit. No changes needed.</div>';
}
function generateTasks(state, days = 30) {
  return generatePlanTasks(state, days);
}

/* =======================================================================
   2. RUNTIME CHECKS — against what actually happened
   ======================================================================= */

function findLogViolations(state, windowMin = 180) {
  const out = [];
  const done = state.tasks.filter(
    (t) => t.kind === "med" && t.status === "done" && t.doneAt,
  );
  const byMed = {};
  done.forEach((t) => {
    const timing = timingStatus(state, t, t.doneAt);
    if (!timing.fits)
      out.push({
        kind: "target",
        a: t,
        msg: `${t.label}: ${timing.reasons.join(" ")}`,
      });
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
          msg: `${med?.drug || "?"} recorded twice, ${Math.round(gap)} min apart. ${exact ? `The instruction requires ${need} min.` : "Check for a duplicate record; this is not a dosing recommendation."} Contact the care team for dose advice.`,
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
          msg: `${ma.drug} and ${mb.drug} were recorded ${Math.round(gap)} min apart; the entered rule requires ${need * 60} min. Check whether the records are accurate. For dose advice, contact the care team.`,
        });
    }
  return out;
}

function computeLoad(state) {
  const by = {};
  state.team.forEach(
    (m) =>
      (by[m.id] = {
        name: m.name + (m.archived ? " (removed)" : ""),
        rel: m.rel,
        total: 0,
        done: 0,
        days: new Set(),
      }),
  );
  let un = 0;
  state.tasks.forEach((t) => {
    if (t.status === "discarded") return;
    const k = by[t.who];
    if (!k) {
      un++;
      return;
    }
    k.total++;
    if (t.status === "done") {
      k.done++;
      k.days.add(t.date);
    }
  });
  const rows = Object.values(by).map((v) => ({
    ...v,
    rate: v.total ? Math.round((v.done / v.total) * 100) : 0,
    activeDays: v.days.size,
  }));
  if (un)
    rows.push({
      name: "Unassigned",
      rel: "—",
      total: un,
      done: 0,
      rate: 0,
      activeDays: 0,
    });
  return rows;
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
const tableObserver = new ResizeObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.target.isConnected) {
      tableObserver.unobserve(entry.target);
      return;
    }
    updateTableScroll(entry.target.closest(".table-scroll"));
  });
});

function notify(message, error = false) {
  const status = $("#saveStatus");
  status.textContent = message;
  status.classList.toggle("error", error);
  if (document.querySelector("#setup-dialog")?.open)
    document.querySelector("#setup-error").textContent = error ? message : "";
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
    setupWizard?.synchronize();
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
  draftStartAt = null;
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
      planStartAt: S.planStartAt,
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
  if (
    S.patient &&
    !confirm(
      translateInterfaceText("Replace this plan with the fictional sample?"),
    )
  )
    return false;
  const parsed = parseLocal(SAMPLE_TEXT),
    candidate = emptyRecord();
  Object.assign(candidate, {
    patient: parsed.patient,
    planStartAt: Date.now(),
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

function renderHome() {
  clearTimeout(queueClockTimer);
  const warnings = $("#patientWarnings");
  warnings.hidden = !S.patient || !S.flags.length;
  warnings.innerHTML = S.flags.length
    ? "<b>From the discharge instructions</b>" +
      S.flags
        .map((flag) => `<div data-no-translate>${esc(flag)}</div>`)
        .join("")
    : "";
  $("#hdrPat").textContent = S.patient
    ? `${S.patient.name} · ${S.patient.age} · discharged ${S.patient.dischargeDate}`
    : S.setup?.patientName || "";
  if (!S.patient) {
    $("#homeSub").textContent = "No plan loaded yet.";
    $("#homeStats").innerHTML = `
      <div class="card hd" style="grid-column:1/-1;margin:0">
        <h3 style="margin:0 0 4px;font-size:15px;color:var(--navy)">Start with a discharge summary</h3>
        <p style="margin:0 0 12px;color:var(--muted);font-size:13.5px">
          Paste one, or open a sample, and CareLoop turns the timing rules buried in the sentences into a 30-day schedule.</p>
        <ol style="margin:0 0 14px 18px;padding:0;font-size:13.5px;line-height:1.8">
          <li><b>Read</b> — paste the English summary, or load the sample.</li>
          <li><b>Review</b> — every extracted field is editable before anything is scheduled.</li>
          <li><b>Compile</b> — doses are placed so the gap and meal rules hold together.</li>
          <li><b>Keep the record</b> — tick off what was given; the log is checked against the rules.</li>
        </ol>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="act" id="btnEmptySample">Load sample family</button>
          <button class="ghost" id="btnEmptyImport">Read a summary</button>
        </div>
      </div>`;
    $("#homeAlerts").innerHTML = "";
    $("#nextCard").style.display = "none";
    $("#overdueTasks").innerHTML = "";
    const bs = $("#btnEmptySample"),
      bi = $("#btnEmptyImport");
    if (bs)
      bs.onclick = async () => {
        if (await seed()) renderAll();
      };
    if (S.setup?.completed) {
      $("#homeSub").textContent = `Welcome, ${S.setup.patientName}.`;
      $("#homeStats h3").textContent = "Your space for care is ready.";
      $("#homeStats p").textContent =
        "Add discharge instructions when you’re ready to build the schedule. You can add or update your care team at any time.";
      $("#homeStats ol").remove();
      bi.textContent = "Add discharge instructions";
    }
    if (bi)
      bi.onclick = () => {
        document.querySelector('button[data-t="import"]').click();
      };
    return;
  }
  const today = localISO(new Date());
  const day = today;
  const tt = S.tasks.filter((t) => t.date === day && t.status !== "discarded");
  const done = tt.filter((t) => t.status === "done").length;
  const pct = tt.length ? Math.round((done / tt.length) * 100) : 0;
  const { next, overdue } = homeQueue(S);
  $("#overdueTasks").innerHTML = overdue
    .map(
      (task) =>
        `<div class="card overdue-card"><div class="timing-status overdue">Past due · ${esc(task.date)} · ${esc(task.time)}</div><h3 data-no-translate>${esc(task.label)}</h3><button class="act" data-overdue-done="${esc(task.id)}">Mark done</button></div>`,
    )
    .join("");
  $("#overdueTasks")
    .querySelectorAll("[data-overdue-done]")
    .forEach((button) => {
      button.onclick = () => openTask(button.dataset.overdueDone, "done");
    });

  const logV = findLogViolations(S);

  $("#homeSub").textContent =
    `${tt.length} doses and checks on ${day} · ${S.tasks.filter((task) => task.status !== "discarded").length} in the 30-day plan`;
  $("#homeStats").innerHTML = `
    <div class="stat"><div class="k">Today</div><div class="v">${done}<small>/${tt.length} done</small></div></div>
    <div class="stat"><div class="k">Adherence</div><div class="v">${pct}<small>%</small></div></div>
    <div class="stat"><div class="k">Rule breaks</div><div class="v" style="color:${logV.length ? "#b3261e" : "#1b7f4b"}">${logV.length}</div></div>
    <div class="stat"><div class="k">Past due</div><div class="v" style="color:${overdue.length ? "#9a5b00" : "#1b7f4b"}">${overdue.length}</div></div>`;

  let a = "";
  if (S.schedule?.violations?.length)
    a += S.schedule.violations
      .map(
        (v) =>
          `<div class="banner"><b>Schedule cannot satisfy the rules</b> — ${esc(v.msg)}</div>`,
      )
      .join("");
  if (logV.length)
    a += logV
      .slice(0, 2)
      .map(
        (v) =>
          `<div class="banner"><b>Record breaks a timing rule</b> — ${esc(v.msg)}</div>`,
      )
      .join("");
  if (!a)
    a =
      '<div class="banner green"><b>No timing alerts in the recorded doses.</b></div>';
  $("#homeAlerts").innerHTML = a;

  if (next) {
    $("#nextCard").style.display = "block";
    $("#nextTitle").textContent =
      `${next.date === today ? "" : next.date + " · "}${next.time} · ${next.label}`;
    const timing = timingStatus(S, next);
    $("#nextCard").className =
      `card hd next-card ${timing.phase} ${timing.phase === "due" && !timing.fits ? "restricted" : ""}`;
    $("#nextStatus").className = `timing-status ${timing.phase}`;
    $("#nextStatus").textContent =
      timing.phase === "due"
        ? timing.fits
          ? "Due now · within target window"
          : "Timing restriction · review before recording"
        : "Upcoming";
    const who = S.team.find((m) => m.id === next.who);
    $("#nextWho").textContent = who
      ? `Assigned to ${who.name} (${who.rel})`
      : "Unassigned";
    const nextBoundary =
      taskDue(next) - Date.now() > 300000
        ? taskDue(next) - 300000
        : taskDue(next) + 1;
    queueClockTimer = setTimeout(
      refreshClock,
      Math.max(25, Math.min(30000, nextBoundary - Date.now())),
    );
    $("#btnNextDone").onclick = () => openTask(next.id, "done");
    $("#btnNextSkip").onclick = () => openTask(next.id, "skip");
  } else $("#nextCard").style.display = "none";
}

const medicineColors = [
  "#168dcc",
  "#2c79af",
  "#4f9bd3",
  "#e77c6b",
  "#79b5e3",
  "#c66b63",
  "#266597",
  "#ed9c8c",
  "#367da8",
  "#bb655c",
  "#5594ba",
  "#d88679",
  "#224f79",
  "#e9ad9f",
  "#73b8d8",
];
function renderSchedule() {
  const host = $("#scheduleBody");
  if (!S.meds.length || !S.schedule) {
    host.innerHTML = '<span class="small">Compile a plan first.</span>';
    return;
  }
  const dates = [
    ...new Set(
      S.tasks
        .filter((task) => task.status !== "discarded")
        .map((task) => task.date),
    ),
  ].sort();
  const selected = host.querySelector("#scheduleDate")?.value;
  const date = dates.includes(selected)
    ? selected
    : dates.includes(localISO(new Date()))
      ? localISO(new Date())
      : dates[0] || localISO(new Date());
  const violations = findLogViolations(S);
  const tasks = S.tasks.filter(
    (task) => task.date === date && task.status !== "discarded",
  );
  const dayMeds = S.meds.filter((med) =>
    tasks.some((task) => task.kind === "med" && task.medId === med.id),
  );
  const groups = dayMeds.map((med) => ({
    kind: "med",
    medId: med.id,
    label: med.drug,
    detail: med.dose,
    color:
      medicineColors[
        S.meds.findIndex((item) => item.id === med.id) % medicineColors.length
      ],
  }));
  for (const group of [
    {
      kind: "weight",
      label: "Weight check",
      detail: "Daily care",
      color: "#487ca5",
    },
    {
      kind: "symptom",
      label: "Symptom check",
      detail: "Daily care",
      color: "#68b2ef",
    },
    {
      kind: "visit",
      label: "Follow-ups",
      detail: "Appointment",
      color: "#da897c",
    },
  ])
    if (tasks.some((task) => task.kind === group.kind)) groups.push(group);
  const doseCount = tasks.filter((task) => task.kind === "med").length;
  const pins = tasks
    .map((task) => {
      const lane = groups.findIndex(
        (group) =>
          group.kind === task.kind &&
          (task.kind !== "med" || group.medId === task.medId),
      );
      const group = groups[lane];
      if (!group) return "";
      const title = task.kind === "med" ? group.label : task.label;
      const actual = task.status === "done" && task.doneAt != null;
      const time = actual
        ? new Date(task.doneAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : task.time;
      const conflict =
        task.kind === "med" &&
        (violations.some(
          (item) => item.a?.id === task.id || item.b?.id === task.id,
        ) ||
          (actual && !timingStatus(S, task, task.doneAt).fits));
      const label = actual
        ? "Done"
        : task.status === "skip"
          ? "Skipped"
          : taskDue(task) < Date.now()
            ? "Past due"
            : "Planned";
      return `<button class="medicine-box ${conflict ? "has-conflict" : ""} ${esc(task.status)}" data-chart-task="${esc(task.id)}" data-kind="${esc(task.kind)}" data-minute="${toMin(time)}" data-lane="${lane}" style="--medicine-color:${group.color}" aria-label="${esc(title)} ${esc(time)} ${label}${conflict ? ", timing conflict" : ""}"><b ${task.kind === "med" || task.kind === "visit" ? "data-no-translate" : ""}>${esc(title)}</b><span ${task.kind === "med" ? "data-no-translate" : ""}>${esc(group.detail)}</span><span class="medicine-box-status">${esc(time)} · ${label}</span>${actual ? `<small>Target ${esc(task.time)}${localISO(new Date(task.doneAt)) !== date ? " · recorded " + esc(localISO(new Date(task.doneAt))) : ""}</small>` : ""}${conflict ? '<small class="box-conflict">Timing conflict</small>' : ""}</button>`;
    })
    .join("");
  host.innerHTML = `<div class="schedule-toolbar"><label>Day <select id="scheduleDate">${(dates.length ? dates : [date]).map((day) => `<option ${day === date ? "selected" : ""}>${esc(day)}</option>`).join("")}</select></label><span class="small">${dayMeds.length} medicines · ${doseCount} doses${tasks.length > doseCount ? ` · ${tasks.length - doseCount} care event${tasks.length - doseCount === 1 ? "" : "s"}` : ""}</span></div>
    <div class="medicine-legend">${groups.map((group) => `<span ${group.kind === "med" ? "data-no-translate" : ""}><i style="background:${group.color}"></i>${esc(group.label)}</span>`).join("")}</div>
    <div class="timeline-scroll"><div class="medicine-timeline" data-date="${esc(date)}" style="--lanes:${Math.max(1, groups.length)}" role="group" aria-label="Daily care timeline">${Array.from({ length: 13 }, (_, i) => `<div class="medicine-hour" style="left:${(i / 12) * 100}%"><span>${String(i * 2).padStart(2, "0")}:00</span></div>`).join("")}${pins}<div class="current-time-line" hidden><span></span></div></div></div>
    <p class="small chart-caption">Completed items appear at their recorded time. Click a box to record or edit.</p>
    <div class="schedule-actions"><button class="act" id="btnRecompile">Auto-resolve schedule</button><span class="small" id="recompMsg" role="status"></span></div>`;
  observeMedicineTimeline(host.querySelector(".medicine-timeline"));
  updateCurrentTime();
  $("#scheduleDate").onchange = renderSchedule;
  host.querySelectorAll("[data-chart-task]").forEach((button) => {
    button.onclick = () => openTask(button.dataset.chartTask);
  });
  $("#btnRecompile").onclick = () => openResolution();
}
function updateCurrentTime() {
  const chart = document.querySelector(".medicine-timeline");
  if (!chart) return;
  for (const box of chart.querySelectorAll(".medicine-box.todo")) {
    const task = S.tasks.find((item) => item.id === box.dataset.chartTask);
    if (task)
      box.querySelector(".medicine-box-status").textContent =
        `${task.time} · ${taskDue(task) < Date.now() ? "Past due" : "Planned"}`;
  }
  const line = chart.querySelector(".current-time-line"),
    now = new Date();
  line.hidden = chart.dataset.date !== localISO(now);
  line.style.left = `${((now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60) / 1440) * 100}%`;
  line.querySelector("span").textContent =
    `Now ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}
function openResolution(reasons = []) {
  if (busy || document.querySelector("#resolution-dialog")) return;
  const token = lastToken;
  const preview = resolveRemaining(S);
  const dialog = document.createElement("dialog");
  dialog.id = "resolution-dialog";
  dialog.setAttribute("aria-labelledby", "resolution-title");
  dialog.innerHTML = `<h2 id="resolution-title">${reasons.length ? "Schedule conflict" : "Resolve remaining schedule"}</h2>${reasons.map((reason) => `<p>${esc(reason)}</p>`).join("")}<p>${reasons.length ? "The completion was saved at the actual time. " : ""}Completed records stay fixed.</p>${preview.ok ? (preview.adjustments.length ? `<p>Apply these changes to pending doses?</p><div class="resolution-changes">${preview.adjustments.map((change) => `<p data-no-translate><b>${esc(change.label)}</b><br>${esc(change.date)} · ${esc(change.before)} → ${esc(change.after)}</p>`).join("")}</div>` : "<p>No pending doses need to move under the entered timing rules.</p>") : `<p role="alert">${esc(preview.message)}</p>`}<p id="resolution-error" role="alert"></p><div class="dialog-actions">${preview.ok && preview.adjustments.length ? '<button class="act" data-apply-resolution>Apply automatic resolution</button>' : ""}<button class="ghost" data-dismiss-resolution>${reasons.length ? "Keep current schedule" : "Close"}</button></div>`;
  document.body.append(dialog);
  dialog.querySelector("[data-dismiss-resolution]").onclick = () =>
    dialog.close();
  dialog.addEventListener("close", () => dialog.remove());
  const apply = dialog.querySelector("[data-apply-resolution]");
  if (apply)
    apply.onclick = async () => {
      if (busy) return;
      if (token !== lastToken) {
        dialog.querySelector("#resolution-error").textContent =
          "Another tab changed the plan. Close and reopen this preview.";
        return;
      }
      if (
        preview.adjustments.some(
          (change) =>
            taskDue(preview.state.tasks.find((task) => task.id === change.id)) <
            Date.now(),
        )
      ) {
        dialog.querySelector("#resolution-error").textContent =
          "Time has moved on. Close and reopen this preview for updated times.";
        return;
      }
      if (await save(preview.state, token)) {
        dialog.close();
        renderAll();
        notify(
          `Schedule updated · ${preview.adjustments.length} pending doses moved.`,
        );
      } else
        dialog.querySelector("#resolution-error").textContent =
          $("#saveStatus").textContent;
    };
  dialog.showModal();
}

function renderTasks() {
  const host = $("#taskList"),
    sub = $("#taskSub");
  const activeTasks = S.tasks.filter((task) => task.status !== "discarded");
  if (!activeTasks.length) {
    sub.textContent = S.patient
      ? "No active items in this plan."
      : "Compile a plan first.";
    host.innerHTML = "";
    $("#conflictBox").innerHTML = "";
    $("#dayFilter").innerHTML = "";
    return;
  }
  const dates = [...new Set(activeTasks.map((t) => t.date))].sort();
  const sel = $("#dayFilter");
  const cur = sel.value && dates.includes(sel.value) ? sel.value : dates[0];
  sub.textContent = `${activeTasks.length} doses and checks over ${dates.length} days`;

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
    const rows = activeTasks.filter((t) => list.includes(t.date));
    host.innerHTML = `<div class="table-scroll"><table><thead><tr><th style="width:56px">Time</th><th>Task</th>
      <th style="width:138px">Assigned</th><th style="width:88px">Status</th><th style="width:138px">Action</th></tr></thead>
      <tbody>${rows
        .map((t) => {
          const bad = v.some((x) => x.a?.id === t.id || x.b?.id === t.id);
          return `<tr class="${bad ? "conflict" : ""}">
          <td class="mono">${t.time}</td>
          <td data-no-translate>${esc(t.label)}${t.doneAt != null ? `<div class="small">Recorded ${esc(new Date(t.doneAt).toLocaleString())}${t.recordedByName ? " · " + esc(t.recordedByName) : ""}</div>` : ""}${t.kind === "visit" ? ' <span class="small">(appointment)</span>' : ""}</td>
          <td><select data-who="${esc(t.id)}"><option value="" ${!t.who ? "selected" : ""}>Unassigned</option>${S.team
            .filter((person) => !person.archived || person.id === t.who)
            .map(
              (m) =>
                `<option value="${esc(m.id)}" ${m.id === t.who ? "selected" : ""}>${esc(m.name)}${m.archived ? " (removed)" : ""}</option>`,
            )
            .join("")}</select></td>
          <td><span class="pill ${esc(t.status)}">${esc(t.status)}</span></td>
          <td><button class="mini ${t.status === "done" ? "done" : ""}" ${t.status === "todo" ? "data-done" : "data-edit"}="${esc(t.id)}">${t.status === "todo" ? "Record" : "Edit record"}</button>
              ${t.status === "todo" ? `<button class="mini" data-skip="${esc(t.id)}">Skip</button>` : ""}</td></tr>`;
        })
        .join("")}</tbody></table></div>`;

    host
      .querySelectorAll("[data-done],[data-edit],[data-skip]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            openTask(
              button.dataset.done || button.dataset.edit || button.dataset.skip,
              button.hasAttribute("data-skip")
                ? "skip"
                : button.hasAttribute("data-done")
                  ? "done"
                  : null,
            )),
      );
    host.querySelectorAll("[data-who]").forEach(
      (select) =>
        (select.onchange = async () => {
          const candidate = structuredClone(S),
            task = candidate.tasks.find((t) => t.id === select.dataset.who);
          if (!task) return;
          task.who = select.value;
          if (await save(candidate)) renderAll();
          else renderAll();
        }),
    );
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
    box.innerHTML = '<span class="small">Compile a plan first.</span>';
    return;
  }
  const load = computeLoad(S);
  const max = Math.max(...load.map((l) => l.total), 1);
  box.innerHTML = `<table><thead><tr><th>Caregiver</th><th style="width:180px">Load</th>
    <th style="width:66px">Tasks</th><th style="width:66px">Done</th>
    <th style="width:78px">Rate</th><th style="width:96px">Active days</th></tr></thead>
    <tbody>${load
      .map(
        (l) => `<tr>
      <td data-no-translate><b>${esc(l.name)}</b><div class="small">${esc(l.rel)}</div></td>
      <td><div class="barwrap"><div class="bar" style="width:${Math.round((l.total / max) * 140)}px"></div>
          <span class="small">${l.total}</span></div></td>
      <td>${l.total}</td><td>${l.done}</td><td>${l.rate}%</td><td>${l.activeDays}</td>
    </tr>`,
      )
      .join("")}</tbody></table>`;
}

/* =======================================================================
   5. WIRING
   ======================================================================= */

$$("nav button").forEach(
  (b) =>
    (b.onclick = () => {
      $$("nav button").forEach((x) => x.classList.remove("on"));
      $$(".panel").forEach((p) => p.classList.remove("on"));
      b.classList.add("on");
      $$("nav button").forEach((x) => x.removeAttribute("aria-current"));
      b.setAttribute("aria-current", "page");
      $("#p-" + b.dataset.t).classList.add("on");
      if (b.dataset.t === "import" && S.patient && !draftLoaded)
        openSavedPlan(false);
      if (b.dataset.t === "home") renderHome();
      if (b.dataset.t === "schedule") {
        renderSchedule();
        scrollTables();
      }
    }),
);

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
  draftStartAt = Object.hasOwn(d, "planStartAt") ? d.planStartAt : Date.now();
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
  $("#fName").value =
    (!S.patient && S.setup?.patientName) || d.patient?.name || "";
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
    setup: setupWizard?.active
      ? { ...S.setup, step: 3, completed: true, patientName: name }
      : S.setup,
    planStartAt: draftStartAt,
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
  if (!(await save(candidate, draftToken))) {
    $("#genStatus").textContent = $("#saveStatus").textContent;
    return;
  }
  draftToken = lastToken;
  draftDirty = false;
  $("#genStatus").textContent = "";
  renderAll();
  setupWizard?.finishAfterPlan();
  document.querySelector('nav button[data-t="schedule"]').click();
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
  if (
    !draftDirty ||
    confirm(
      translateInterfaceText("Discard this draft and reopen the saved plan?"),
    )
  ) {
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
      translateInterfaceText(
        "Remove this caregiver? Pending future assignments will become unassigned; recorded names stay in history.",
      ),
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
  if (!task || task.status === "discarded" || isTaskExpired(task)) {
    void refreshClock();
    return;
  }
  const token = lastToken,
    initialStatus = task.status,
    originalTime = task.doneAt || Date.now(),
    displayTime = localInput(originalTime);
  const dialog = document.createElement("dialog");
  dialog.id = "task-dialog";
  dialog.setAttribute("aria-labelledby", "record-title");
  const active = S.team.filter((person) => !person.archived);
  dialog.innerHTML = `<form id="record-form"><h2 id="record-title" data-no-translate>${esc(task.label)}</h2><p class="small">Scheduled ${esc(task.date)} · ${esc(task.time)}</p><label class="field">Status<select name="status"><option value="done">Completed</option><option value="skip">Skipped</option><option value="todo">Pending</option></select></label><label class="field">Recorded by<select name="recordedBy" required><option value="">Choose a name</option>${active.map((person) => `<option value="${esc(person.id)}">${esc(person.name)}</option>`).join("")}</select></label><label class="field" id="actual-field">Actual time (device time)<input name="actualAt" type="datetime-local" required value="${esc(displayTime)}"></label><label class="field" id="clock-choice" hidden>Repeated clock time<select name="occurrence"></select></label><label class="field">${initialStatus === "todo" ? "Note (optional)" : "Reason for correction"}<textarea name="note" rows="2" maxlength="2000">${esc(task.note || "")}</textarea></label>${task.corrections?.length ? `<details><summary>Corrections (${task.corrections.length})</summary>${task.corrections.map((change) => `<p class="small">${esc(new Date(change.at).toLocaleString())} · ${esc(change.by)}: ${esc(change.before.status)} → ${esc(change.after.status)}<br>${esc(change.before.doneAt ? new Date(change.before.doneAt).toLocaleString() : "No recorded time")} → ${esc(change.after.doneAt ? new Date(change.after.doneAt).toLocaleString() : "No recorded time")}<br><span data-no-translate>${esc(change.reason)}</span></p>`).join("")}</details>` : ""}<p id="record-error" role="alert"></p><div class="dialog-actions"><button class="act" type="submit">Save record</button><button class="ghost" type="button" data-cancel>Cancel</button></div></form>`;
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
        const recorded = candidate.tasks.find((item) => item.id === id);
        if (recorded.kind === "med" && recorded.status === "done") {
          const timing = timingStatus(candidate, recorded, recorded.doneAt);
          if (!timing.fits) openResolution(timing.reasons);
        }
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
await expireOldTasks();
if (S.patient && S.tasks.length) {
  renderAll();
} else {
  renderHome();
}

if (location.protocol !== "file:" && "serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});

function updateTableScroll(scroll) {
  if (
    !scroll?.isConnected ||
    !scroll.previousElementSibling?.classList.contains("table-hint")
  )
    return;
  const overflowing = scroll.scrollWidth > scroll.clientWidth + 1;
  scroll.classList.toggle("is-overflowing", overflowing);
  scroll.previousElementSibling.hidden = !overflowing;
  if (overflowing) scroll.setAttribute("tabindex", "0");
  else scroll.removeAttribute("tabindex");
}
function scrollTables() {
  for (const table of document.querySelectorAll("table")) {
    let scroll = table.closest(".table-scroll");
    if (!scroll) {
      scroll = document.createElement("div");
      scroll.className = "table-scroll";
      table.before(scroll);
      scroll.append(table);
    }
    if (!scroll.previousElementSibling?.classList.contains("table-hint")) {
      const hint = document.createElement("p");
      hint.className = "table-hint";
      hint.textContent = "Swipe across the table to see all columns →";
      hint.hidden = true;
      scroll.before(hint);
      scroll.setAttribute("role", "region");
      scroll.setAttribute(
        "aria-label",
        (table.closest(".panel")?.querySelector("h2")?.textContent || "Care") +
          " table, scroll for more columns",
      );
      tableObserver.observe(scroll);
      tableObserver.observe(table);
    }
    updateTableScroll(scroll);
  }
}

scrollTables();

let lastDisplayedDate = localISO(new Date());
async function expireOldTasks() {
  if (busy || !S.tasks.some((task) => isTaskExpired(task))) return;
  busy = true;
  try {
    const previousToken = lastToken;
    const snapshot = await recordStore.discardExpired();
    acceptSnapshot(snapshot);
    if (draftToken === previousToken) draftToken = lastToken;
    renderAll();
  } catch (error) {
    notify(error.message, true);
  } finally {
    busy = false;
  }
}
async function refreshClock() {
  synchronize();
  await expireOldTasks();
  if (!S.patient) return;
  const date = localISO(new Date());
  renderHome();
  updateCurrentTime();
  if (date !== lastDisplayedDate) {
    const daySelect = document.querySelector("#scheduleDate");
    if (daySelect?.value === lastDisplayedDate) daySelect.value = date;
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

createLanguageControl();

setupWizard = createSetupWizard({
  snapshot: () => S,
  saveSetup: async (setup) => {
    const saved = await save({ ...S, setup });
    if (saved) {
      draftToken = lastToken;
      renderHome();
    }
    return saved;
  },
  renderTeam,
  afterFinish: (destination) => {
    renderAll();
    document.querySelector(`nav [data-t="${destination}"]`).click();
  },
});
setupWizard.openIfNeeded();
