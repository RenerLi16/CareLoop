import {
  autoResolve,
  checkTimes,
  DEFAULT_MEALS,
  FREQUENCIES,
} from "/scheduler.js";

/* =========================================================================
   CareLoop — single-file prototype
   The parser, the compiler and every safety check are hand-written and deterministic.
   ========================================================================= */

const LS = "careloop_instructor_resolver_v1";
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
let lastSaved;
const validDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value || "") &&
  localISO(new Date(value + "T12:00:00")) === value;

function localISO(d) {
  const y = d.getFullYear(),
    m = String(d.getMonth() + 1).padStart(2, "0"),
    day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

let S = {
  patient: null,
  meds: [],
  followups: [],
  flags: [],
  weigh: true,
  symptoms: true,
  tasks: [],
  team: [],
  uiLang: "en",
  schedule: null,
  meals: { ...DEFAULT_MEALS },
  history: [],
};

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
  const old = new Map(S.tasks.map((task) => [task.id, task]));
  const tasks = generateTasks(candidate, 30).map((task) => {
    const prior = old.get(task.id);
    if (prior && prior.status !== "todo") return { ...prior };
    return prior ? { ...task, who: prior.who } : task;
  });
  const ids = new Set(tasks.map((task) => task.id));
  candidate.history = [
    ...(S.history || []),
    ...S.tasks.filter((task) => task.status !== "todo" && !ids.has(task.id)),
  ];
  return tasks;
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
  if (!state.patient || !state.schedule) return [];
  const out = [];
  const start = new Date(state.patient.dischargeDate + "T00:00:00");
  const team = state.team.length
    ? state.team
    : [{ id: "t1", name: "Me", rel: "self" }];

  for (let d = 0; d < days; d++) {
    const dt = new Date(start);
    dt.setDate(dt.getDate() + d);
    const iso = localISO(dt);
    state.meds.forEach((m, mi) => {
      (state.schedule.times[m.id] || []).forEach((tm, idx) => {
        out.push({
          id: `${iso}-${m.id}-${idx}`,
          date: iso,
          time: tm,
          kind: "med",
          label: `${esc(m.drug)} ${esc(m.dose)}`,
          medId: m.id,
          who: team[(d + mi + idx) % team.length].id,
          status: "todo",
          doneAt: null,
        });
      });
    });
    if (state.weigh)
      out.push({
        id: `${iso}-w`,
        date: iso,
        time: "08:30",
        kind: "weight",
        label: "Morning weight",
        who: team[d % team.length].id,
        status: "todo",
        doneAt: null,
      });
    if (state.symptoms)
      out.push({
        id: `${iso}-s`,
        date: iso,
        time: "19:00",
        kind: "symptom",
        label: "Daily symptom check",
        who: team[(d + 1) % team.length].id,
        status: "todo",
        doneAt: null,
      });
  }

  (state.followups || []).forEach((f) => {
    const dt = new Date(start);
    dt.setDate(dt.getDate() + Number(f.days || 7));
    out.push({
      id: `fu-${f.id}`,
      date: localISO(dt),
      time: "09:00",
      kind: "visit",
      label: `Book ${f.who} follow-up`,
      who: team[0].id,
      status: "todo",
      doneAt: null,
    });
  });

  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
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

function findMissed(state, nowMin, graceMin = 60) {
  const today = localISO(new Date());
  return state.tasks
    .filter((t) => t.kind === "med" && t.status === "todo" && t.date === today)
    .filter((t) => nowMin - toMin(t.time) > graceMin)
    .map((t) => {
      const late = nowMin - toMin(t.time);
      return {
        task: t,
        lateMin: late,
        msg: `${t.time} ${esc(t.label)} still open — ${Math.floor(late / 60)}h ${late % 60}m past due.`,
      };
    });
}

function computeLoad(state) {
  const by = {};
  state.team.forEach(
    (m) =>
      (by[m.id] = {
        name: m.name,
        rel: m.rel,
        total: 0,
        done: 0,
        days: new Set(),
      }),
  );
  let un = 0;
  state.tasks.forEach((t) => {
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
  const t = text.replace(/\r/g, "");
  const meds = [],
    unread = [];
  let inMed = false;

  t.split("\n").forEach((line) => {
    const L = line.trim();
    if (/^MEDICATIONS/i.test(L)) {
      inMed = true;
      return;
    }
    if (/^(FOLLOW|MONITORING|CALL|GO TO)/i.test(L)) {
      inMed = false;
      return;
    }
    if (!inMed || !L) return;

    const m = L.match(
      /^(.+?)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|units?))\b\s*(.*)$/i,
    );
    if (!m) {
      unread.push(L);
      return;
    }
    const rest = (m[3] || "").toLowerCase();

    let freq = "";
    if (/once daily/.test(rest)) freq = "once daily";
    else if (/twice daily/.test(rest)) freq = "twice daily";
    else if (/three times daily/.test(rest)) freq = "three times daily";
    else if (/every 8 hours/.test(rest)) freq = "every 8 hours";
    else if (/every 6 hours/.test(rest)) freq = "every 6 hours";
    else if (/every 12 hours/.test(rest)) freq = "every 12 hours";
    else if (/at bedtime/.test(rest)) freq = "at bedtime";
    else if (/in the morning|every morning/.test(rest)) freq = "in the morning";

    if (
      (!freq || freq === "once daily") &&
      /in the morning|every morning/.test(rest)
    )
      freq = "in the morning";

    let meal = "any";
    if (/with food|with meals/.test(rest)) meal = "with";
    else if (/before (food|meals|breakfast)/.test(rest)) meal = "before";
    else if (/after (food|meals)/.test(rest)) meal = "after";

    let gapH = null,
      gapTarget = "";
    const g1 = rest.match(/at least\s+(\d+(?:\.\d+)?)\s*(?:hour|hr)/);
    if (g1) gapH = +g1[1];
    const g2 = rest.match(/(\d+(?:\.\d+)?)\s*hours?\s+apart/);
    if (g2) gapH = +g2[1];

    const target = rest.match(/apart from\s+(.+?)(?=[.;]|$)/i);
    if (target) gapTarget = target[1].trim();
    const leftover = rest
      .replace(/\bby mouth\b/g, "")
      .replace(
        /\b(once daily|twice daily|three times daily|every 8 hours|every 6 hours|every 12 hours|at bedtime|in the morning|every morning)\b/g,
        "",
      )
      .replace(
        /\b(with food|with meals|before food|before meals|before breakfast|after food|after meals)\b/g,
        "",
      )
      .replace(
        /\bat least\s+\d+(?:\.\d+)?\s*(?:hours?|hrs?)\s+apart(?: from [^.;]+)?/g,
        "",
      )
      .replace(/[\s,.;]+/g, " ")
      .trim();
    meds.push({
      id: "m" + meds.length,
      drug: m[1].trim(),
      dose: m[2].trim(),
      freq,
      meal,
      gapH,
      gapTarget,
      source: L,
      issue: leftover ? "Review: " + leftover : "",
      mealTarget: /before breakfast/.test(rest) ? "breakfast" : "any",
    });
  });

  const followups = [];
  const fm = t.match(/Cardiology in (\d+) days/i);
  if (fm) followups.push({ id: "f0", who: "Cardiology", days: +fm[1] });
  const pm = t.match(/Primary care in (\d+) days/i);
  if (pm) followups.push({ id: "f1", who: "Primary care", days: +pm[1] });

  const flags = [];
  const block = (t.split(/CALL THE DOCTOR IF/i)[1] || "").split(
    /GO TO EMERGENCY IF/i,
  )[0];
  block.split("\n").forEach((l) => {
    const s = l.trim();
    if (s && s.length > 8 && !/^(GO TO|EMERGENCY)/i.test(s))
      flags.push(s.replace(/\.$/, ""));
  });
  const em = t.match(/GO TO EMERGENCY IF([\s\S]*?)$/i);
  if (em)
    em[1].split("\n").forEach((l) => {
      if (l.trim().length > 5) flags.push(l.trim());
    });

  const nm = t.match(/Patient:\s*([^\n]+?)\s+Age:\s*(\d+)/i);
  const dm = t.match(/Discharged:\s*([\d-]+)/i);

  return {
    patient: {
      name: nm ? nm[1].trim() : "",
      age: nm ? +nm[2] : "",
      dischargeDate: dm ? dm[1] : localISO(new Date()),
      lang: "en",
    },
    meds,
    unread,
    followups,
    flags: flags.slice(0, 6),
  };
}

/* =======================================================================
   4. STATE / RENDER
   ======================================================================= */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
function save() {
  try {
    localStorage.setItem(LS, JSON.stringify(S));
    lastSaved = structuredClone(S);
    $("#saveStatus").textContent = "";
    return true;
  } catch (error) {
    if (lastSaved) S = structuredClone(lastSaved);
    $("#saveStatus").textContent =
      "Changes could not be saved. Storage may be full or unavailable.";
    return false;
  }
}
function load() {
  try {
    const raw = localStorage.getItem(LS);
    if (raw) {
      const record = JSON.parse(raw);
      if (
        !Array.isArray(record.meds) ||
        !Array.isArray(record.tasks) ||
        !Array.isArray(record.team)
      )
        throw new Error("Invalid record");
      S = Object.assign(S, record);
    }
    lastSaved = structuredClone(S);
  } catch (error) {
    $("#saveStatus").textContent =
      "The saved record could not be opened. It has not been deleted.";
  }
}

function seed() {
  if (S.patient && !confirm("Replace this plan with the fictional sample?"))
    return false;
  const p = parseLocal(SAMPLE_TEXT);
  S.patient = p.patient;
  S.meds = p.meds;
  S.followups = p.followups;
  S.flags = p.flags;
  S.weigh = true;
  S.symptoms = true;
  S.team = [
    { id: "t1", name: "Lan", rel: "daughter" },
    { id: "t2", name: "Minh", rel: "son" },
    { id: "t3", name: "Amy", rel: "granddaughter" },
  ];
  S.schedule = compileSchedule(S.meds);
  S.tasks = generateTasks(S, 30);
  S.tasks
    .filter((t) => t.date === S.patient.dischargeDate)
    .slice(0, 2)
    .forEach((t, i) => {
      t.status = "done";
      t.doneAt = Date.now() - (240 - i * 60) * 60000;
    });
  return save();
}

function renderAll() {
  renderHome();
  renderSchedule();
  renderTasks();
  renderTeam();
  scrollTables();
}

function renderHome() {
  $("#hdrPat").textContent = S.patient
    ? `${S.patient.name} · ${S.patient.age} · discharged ${S.patient.dischargeDate}`
    : "";
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
    const bs = $("#btnEmptySample"),
      bi = $("#btnEmptyImport");
    if (bs)
      bs.onclick = () => {
        seed();
        renderAll();
      };
    if (bi)
      bi.onclick = () => {
        document.querySelector('button[data-t="import"]').click();
      };
    return;
  }
  const today = localISO(new Date());
  const day = today;
  const tt = S.tasks.filter((t) => t.date === day);
  const done = tt.filter((t) => t.status === "done").length;
  const pct = tt.length ? Math.round((done / tt.length) * 100) : 0;
  const next = tt.find((t) => t.status === "todo");

  const logV = findLogViolations(S);
  const now = new Date(),
    nowMin = now.getHours() * 60 + now.getMinutes();
  const missed = findMissed(S, nowMin);

  $("#homeSub").textContent =
    `${tt.length} doses and checks on ${day} · ${S.tasks.length} in the 30-day plan`;
  $("#homeStats").innerHTML = `
    <div class="stat"><div class="k">Today</div><div class="v">${done}<small>/${tt.length} done</small></div></div>
    <div class="stat"><div class="k">Adherence</div><div class="v">${pct}<small>%</small></div></div>
    <div class="stat"><div class="k">Rule breaks</div><div class="v" style="color:${logV.length ? "#b3261e" : "#1b7f4b"}">${logV.length}</div></div>
    <div class="stat"><div class="k">Past due</div><div class="v" style="color:${missed.length ? "#9a5b00" : "#1b7f4b"}">${missed.length}</div></div>`;

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
  if (missed.length)
    a += missed
      .slice(0, 2)
      .map(
        (m) =>
          `<div class="banner amber"><b>Dose still open</b> — ${esc(m.msg)}</div>`,
      )
      .join("");
  if (!a)
    a =
      '<div class="banner green"><b>No timing alerts in the recorded doses.</b></div>';
  $("#homeAlerts").innerHTML = a;

  if (next) {
    $("#nextCard").style.display = "block";
    $("#nextTitle").textContent = `${next.time} · ${next.label}`;
    const who = S.team.find((m) => m.id === next.who);
    $("#nextWho").textContent = who
      ? `Assigned to ${who.name} (${who.rel})`
      : "Unassigned";
    $("#btnNextDone").onclick = () => {
      next.status = "done";
      next.doneAt = Date.now();
      if (save()) renderAll();
    };
    $("#btnNextSkip").onclick = () => {
      next.status = "skip";
      if (save()) renderAll();
    };
  } else $("#nextCard").style.display = "none";
}

function renderSchedule() {
  const host = $("#scheduleBody");
  if (!S.meds.length || !S.schedule) {
    host.innerHTML = '<span class="small">Compile a plan first.</span>';
    return;
  }
  const bad = S.schedule.bad || {};

  const pins = [];
  Object.entries(S.schedule.times).forEach(([medId, ts]) => {
    ts.forEach((t) => {
      const left = ((toMin(t) / 1440) * 100).toFixed(2);
      pins.push(`<div class="pin ${bad[medId] ? "bad" : ""}" style="left:${left}%">
        <div class="dot"></div><div class="lb">${t}</div></div>`);
    });
  });
  let lbl = "";
  [0, 6, 12, 18, 24].forEach((h) => {
    lbl += `<div class="hourlbl" style="left:${((h / 24) * 100).toFixed(2)}%">${String(h).padStart(2, "0")}</div>`;
  });

  const rows = S.meds
    .map((m) => {
      const ts = (S.schedule.times[m.id] || []).join(", ") || "—";
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
    <div class="tl">${lbl}${pins.join("")}</div>
    <div class="small" style="margin:8px 0 12px">
      Entered rules, scheduled together.
      ${viol.length ? '<b style="color:#b3261e">Red pins break a rule.</b>' : "Supported rules satisfied."}</div>
    ${resolutionHTML(S.schedule)}
    <div class="card">
      <h2 style="font-size:15px">Rules the compiler had to honour</h2>
      <table><thead><tr><th>Drug</th><th style="width:130px">How often</th><th style="width:110px">Meal</th>
      <th style="width:140px">Spacing</th><th style="width:150px">Compiled time</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>
    <div class="card hd">
      <div class="small">Automatic resolution preserves the entered doses and timing rules.</div>
      <div style="margin-top:9px">
        <button class="act" id="btnRecompile">Auto-resolve schedule</button>
        <button class="ghost" id="btnTestMove" style="margin-left:6px">Try a conflict example</button>
      </div>
      <div class="small" id="recompMsg" style="margin-top:8px"></div>
    </div>`;

  $("#btnRecompile").onclick = () => {
    const resolved = compileSchedule(S.meds, S.schedule.times);
    if (!resolved.ok) {
      $("#recompMsg").innerHTML = resolutionHTML(resolved);
      return;
    }
    const candidate = { ...S, schedule: resolved };
    candidate.tasks = rebuildTasks(candidate);
    S = candidate;
    if (save()) renderAll();
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
    sub.textContent = "Compile a plan first.";
    host.innerHTML = "";
    $("#conflictBox").innerHTML = "";
    $("#dayFilter").innerHTML = "";
    return;
  }
  const dates = [...new Set(S.tasks.map((t) => t.date))].sort();
  const sel = $("#dayFilter");
  const cur = sel.value && dates.includes(sel.value) ? sel.value : dates[0];
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
    const rows = S.tasks.filter((t) => list.includes(t.date));
    host.innerHTML = `<div class="table-scroll"><table><thead><tr><th style="width:56px">Time</th><th>Task</th>
      <th style="width:138px">Assigned</th><th style="width:88px">Status</th><th style="width:138px">Action</th></tr></thead>
      <tbody>${rows
        .map((t) => {
          const bad = v.some((x) => x.a?.id === t.id || x.b?.id === t.id);
          return `<tr class="${bad ? "conflict" : ""}">
          <td class="mono">${t.time}</td>
          <td>${esc(t.label)}${t.kind === "visit" ? ' <span class="small">(appointment)</span>' : ""}</td>
          <td><select data-who="${esc(t.id)}">${S.team
            .map(
              (m) =>
                `<option value="${m.id}" ${m.id === t.who ? "selected" : ""}>${esc(m.name)}</option>`,
            )
            .join("")}</select></td>
          <td><span class="pill ${esc(t.status)}">${esc(t.status)}</span></td>
          <td><button class="mini ${t.status === "done" ? "done" : ""}" data-done="${esc(t.id)}">Done</button>
              <button class="mini" data-skip="${esc(t.id)}">Skip</button></td></tr>`;
        })
        .join("")}</tbody></table></div>`;

    host.querySelectorAll("[data-done]").forEach(
      (b) =>
        (b.onclick = () => {
          const t = S.tasks.find((x) => x.id === b.dataset.done);
          t.status = "done";
          t.doneAt = Date.now();
          if (save()) renderAll();
        }),
    );
    host.querySelectorAll("[data-skip]").forEach(
      (b) =>
        (b.onclick = () => {
          const t = S.tasks.find((x) => x.id === b.dataset.skip);
          t.status = "skip";
          t.doneAt = null;
          if (save()) renderAll();
        }),
    );
    host.querySelectorAll("[data-who]").forEach(
      (s) =>
        (s.onchange = () => {
          const t = S.tasks.find((x) => x.id === s.dataset.who);
          t.who = s.value;
          if (save()) renderAll();
        }),
    );
  }
}

function renderTeam() {
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
      <td><b>${esc(l.name)}</b><div class="small">${esc(l.rel)}</div></td>
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
      $("#p-" + b.dataset.t).classList.add("on");
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

function fillReview(d) {
  $("#reviewBox").style.display = "block";
  reviewFlags = d.flags || [];
  unreadLines = d.unread || [];
  $("#readWarnings").innerHTML = unreadLines.length
    ? `<div class="banner"><b>Not read:</b>${unreadLines.map((line) => `<div>${esc(line)}</div>`).join("")}<label class="ck"><input id="ackUnread" type="checkbox">I entered these instructions manually below.</label></div>`
    : "";
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
  $("#flagList").innerHTML =
    d.flags && d.flags.length
      ? d.flags.map((f) => `<div>• ${esc(f)}</div>`).join("")
      : '<span class="small">No red flags read.</span>';
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
    <td><select class="mMeal">${MEAL_OPTS.map(([v, l]) => `<option value="${v}" ${v === (m.meal || "any") ? "selected" : ""}>${l}</option>`).join("")}</select></td>
    <td><input type="text" class="mTarget" value="${esc(m.gapTarget || "")}" placeholder="All other medicines"></td>
    <td><input type="number" class="mGap" value="${esc(m.gapH ?? "")}" placeholder="—" min="0" step="1"></td>
    <td><button class="mini remove-row" type="button" aria-label="Remove row">×</button></td>`;
  $("#medTable tbody").appendChild(tr);
}
document.addEventListener("click", (event) => {
  if (event.target.closest(".remove-row")) event.target.closest("tr").remove();
});
$("#btnAddMed").onclick = () => addMedRow();

function addFuRow(f = {}) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="fWho" value="${esc(f.who || "")}" placeholder="Cardiology"></td>
    <td><input type="number" class="fDays" min="0" max="365" value="${esc(f.days ?? 7)}"></td>
    <td><button class="mini remove-row" type="button" aria-label="Remove row">×</button></td>`;
  $("#fuTable tbody").appendChild(tr);
}
$("#btnAddFu").onclick = () => addFuRow();

$("#btnGenerate").onclick = () => {
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
    flags: [...reviewFlags],
    meals,
    weigh: $("#fWeigh").checked,
    symptoms: $("#fSymptoms").checked,
    schedule: resolved,
  };
  if (!candidate.team.length)
    candidate.team = [
      { id: "t1", name: "Lan", rel: "daughter" },
      { id: "t2", name: "Minh", rel: "son" },
      { id: "t3", name: "Amy", rel: "granddaughter" },
    ];
  candidate.tasks = rebuildTasks(candidate);
  S = candidate;
  if (!save()) return;
  $("#genStatus").textContent = "";
  renderAll();
  document.querySelector('nav button[data-t="schedule"]').click();
};

$("#btnSeed").onclick = () => {
  if (!seed()) return;
  renderAll();
  alert(
    "Sample family reloaded: Nguyen Thi Hoa · 3 caregivers · timing rules compiled.",
  );
};

$("#btnReset").onclick = () => {
  if (!confirm("Clear all local data?")) return;
  try {
    localStorage.removeItem(LS);
  } catch (error) {
    $("#saveStatus").textContent = "Data could not be cleared.";
    return;
  }
  S = {
    patient: null,
    meds: [],
    followups: [],
    flags: [],
    weigh: true,
    symptoms: true,
    tasks: [],
    team: [],
    uiLang: "en",
    schedule: null,
    meals: { ...DEFAULT_MEALS },
    history: [],
  };
  lastSaved = structuredClone(S);
  renderAll();
  $("#reviewBox").style.display = "none";
  $("#rawText").value = "";
  $("#parseStatus").textContent = "";
  $("#genStatus").textContent = "";
};

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
