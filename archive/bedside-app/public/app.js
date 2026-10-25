import {
  FREQUENCIES,
  DEFAULT_PREFS,
  parseDischarge,
  compilePlan,
  logWarnings,
  toICS,
  addDays,
} from "/domain.js";
import { loadRecord, saveChange, onRecordChange } from "/storage.js";
import { createRecovery } from "/recovery.js";
import { bedsideDay } from "/bedside.js";
import {
  planDays,
  timelineGroups,
  caregiverLoads,
  conflictExample,
  calendarMonth,
} from "/plan-views.js";
import {
  getDeviceStatus,
  onDeviceStatus,
  prepareOffline,
  requestStorageProtection,
  installApp,
  checkForUpdates,
} from "/offline.js";

const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let state = null,
  tab = "today",
  draft = null,
  preview = null,
  draftVersion = null,
  filter = "",
  recordQuery = "",
  busy = false,
  reminderTimer = null,
  renderedTab = null,
  scheduleDate = "",
  planDate = "",
  planAllDays = false,
  planStatus = "all",
  planCaregiver = "all",
  calendarDate = "",
  calendarMonthValue = "",
  ruleDemo = false;
const app = $("#app");
const recovery = createRecovery({
  getLatest: loadRecord,
  save: commit,
  download,
  toast,
  onComplete: async () => {
    clearInterval(reminderTimer);
    draft = null;
    preview = null;
    draftVersion = null;
    tab = "today";
    filter = "";
    recordQuery = "";
    scheduleDate = "";
    planDate = "";
    planAllDays = false;
    planStatus = "all";
    planCaregiver = "all";
    calendarDate = "";
    calendarMonthValue = "";
    ruleDemo = false;
    await refresh();
  },
});
const localDate = () =>
  new Date().toLocaleDateString("en-CA", {
    timeZone:
      state?.plan?.timeZone ||
      state?.profile?.timeZone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
const localInput = (iso = new Date().toISOString()) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const fmt = (iso) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: state?.plan?.timeZone || state?.profile?.timeZone,
  }).format(new Date(iso));
function toast(message, error = false) {
  $("#toast").textContent = message;
  $("#toast").className = error ? "show error" : "show";
  setTimeout(() => ($("#toast").className = ""), 6500);
}
async function commit(command, expectedVersion = state.version) {
  state = await saveChange(command, expectedVersion);
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function refresh(render = true) {
  state = await loadRecord();
  if (render) draw();
}
const button = (action, label, cls = "primary", extra = "") =>
  `<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
const field = (label, name, value = "", type = "text", extra = "") =>
  `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select = (label, name, value, choices) =>
  `<label>${label}<select name="${name}" aria-label="${esc(label)}">${choices
    .map((x) => {
      const [v, l] = Array.isArray(x) ? x : [x, x];
      return `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`;
    })
    .join("")}</select></label>`;
function setup() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  app.innerHTML = `<main class="setup"><a class="brand" href="/">✳ <span>CareLoop</span></a><h1>Set up CareLoop</h1><section class="card"><h2>Who are we caring for?</h2><form id="setup-form">${field("Patient name or nickname", "patient", "", "text", 'required maxlength="100" autocomplete="off"')}${field("Plan start date", "startDate", localDate(), "date", "required")}${select("Patient’s time zone", "timeZone", zone, [...new Set([zone, ...Intl.supportedValuesOf("timeZone")])])}<details><summary>Meal and routine times</summary><div class="grid three">${Object.entries(
    DEFAULT_PREFS,
  )
    .map(([key, value]) =>
      field(
        key[0].toUpperCase() + key.slice(1),
        `pref-${key}`,
        value,
        "time",
        "required",
      ),
    )
    .join(
      "",
    )}</div></details><label>Caregiver names (optional, one per line)<textarea name="names" rows="3" placeholder="Lan&#10;Minh"></textarea></label><button type="submit" class="primary">Set up this device</button></form></section><p class="muted">Saved in this browser. Clearing browser data deletes the record.</p><section class="card"><h2>Restore a backup</h2><label class="file-label">Choose backup to restore<input type="file" id="backup-upload" accept=".json,application/json"></label></section></main>`;
}
function storageFailure(message) {
  app.innerHTML = `<main class="setup"><h1>Local storage needs attention.</h1><section class="alert" role="alert"><p>${esc(message)}</p><p>CareLoop has not started a temporary record. Your existing data has not been replaced.</p>${button("retry-storage", "Try opening storage again", "secondary")}</section></main>`;
}
function draw() {
  if (!state?.profile) {
    setup();
    return;
  }
  const navigationScroll = app.querySelector("nav")?.scrollLeft || 0;
  app.innerHTML = `<div class="shell full-feature-app instructor-app"><header class="app-masthead"><a class="brand" href="/">CareLoop</a><span class="team-label">${esc(state.profile.patient)}</span></header><nav aria-label="Main navigation">${[
    ["today", "◷", "Today"],
    ["plan", "+", "Read discharge"],
    ["schedule", "◴", "Daily schedule"],
    ["month", "▦", "30-day plan"],
    ["team", "♧", "Care team"],
    ["calendar", "▣", "Calendar"],
    ["records", "☷", "Records"],
    ["settings", "⚙", "Settings"],
  ]
    .map(
      ([key, icon, label]) =>
        `<button type="button" data-tab="${key}" class="nav-item ${key === tab ? "active" : ""}" ${key === tab ? 'aria-current="page"' : ""}><span aria-hidden="true">${icon}</span>${label}</button>`,
    )
    .join(
      "",
    )}</nav><main class="main"><div id="content">${{ today, plan: planView, schedule: scheduleView, month: monthView, team: teamView, calendar: calendarView, records: recordsView, settings: settingsView }[tab]()}</div></main></div>`;
  app.querySelector("nav").scrollLeft = navigationScroll;
  if (renderedTab !== tab) {
    window.scrollTo(0, 0);
    renderedTab = tab;
  }
}
function emptyView() {
  return `<section class="empty card"><span class="big-icon">✳</span><h2>Add your discharge instructions</h2>${button("new-plan", "Create a care plan", "primary bedside-button")}</section>`;
}
function heading(title, sub = "", actions = "") {
  return `<div class="heading"><div><h1>${title}</h1>${sub ? `<p class="lead">${sub}</p>` : ""}</div>${actions}</div>`;
}
function warningsView(warnings = logWarnings(state.tasks, state.plan)) {
  return warnings.length
    ? `<section class="alert" role="status"><h3>Records to review (${warnings.length})</h3>${warnings
        .slice(-10)
        .map(
          (w) =>
            `<p>${esc(w.message)}${w.source ? `<small>Entered instruction: ${esc(w.source)}</small>` : ""}</p>`,
        )
        .join("")}</section>`
    : "";
}
function timeLabel(iso) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: state.plan?.timeZone || state.profile.timeZone,
  }).format(new Date(iso));
}
function taskSummary(task) {
  const person = state.team.find((p) => p.id === task.who);
  return `${person ? person.name : "Unassigned"}${task.actualAt ? " · Recorded " + fmt(task.actualAt) + (task.recordedByName ? " by " + task.recordedByName : "") : ""}`;
}
function today() {
  const date = localDate(),
    day = bedsideDay(state.tasks, date),
    next = day.next;
  const dateLabel = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: state.profile.timeZone,
  }).format(new Date());
  const late = next && Date.parse(next.dueAt) < Date.now() - 3600000;
  const timingAlerts = logWarnings(state.tasks, state.plan);
  const medicines = day.today.filter((task) => task.kind === "med");
  const medicineDone = medicines.filter(
    (task) => task.status === "done",
  ).length;
  const completion = day.today.length
    ? Math.round((day.completed.length / day.today.length) * 100)
    : 0;
  return (
    heading(
      "Today",
      `${esc(dateLabel)} · ${esc(state.profile.patient)}`,
      '<button type="button" class="secondary" data-tab="plan">Paste instructions</button>',
    ) +
    (!state.plan
      ? emptyView()
      : `<div class="bedside-view"><div class="bedside-progress overview-stats" aria-label="Today’s progress"><div><span>Today</span><strong>${day.completed.length}<small> / ${day.today.length} done</small></strong><small>${day.skipped.length} Skipped</small></div><div><span>Completion</span><strong>${completion}<small>%</small></strong><small>${medicineDone} / ${medicines.length} medicines</small></div><div><span>Timing alerts</span><strong>${timingAlerts.length}</strong></div><div><span>Past due</span><strong>${day.pastDue.length}</strong></div></div>${warningsView(timingAlerts)}${day.earlier.length ? `<section class="earlier-notice"><div><b>${day.earlier.length} earlier task${day.earlier.length === 1 ? " has" : "s have"} no record yet</b></div>${button("earlier-records", "Review earlier records", "secondary", `data-date="${esc(day.earlier[0].date)}"`)}</section>` : ""}<section class="card bedside-focus" aria-labelledby="next-task-title"><div class="focus-heading"><span class="eyebrow">${late ? "CHECK THIS TASK" : "NEXT ON TODAY’S PLAN"}</span><span class="badge ${late ? "late" : ""}">${late ? "Past due" : next ? "Pending" : "Today"}</span></div>${next ? `<div class="focus-time">${esc(timeLabel(next.dueAt))}</div><h2 id="next-task-title">${esc(next.label)}</h2><p>${esc(taskSummary(next))}</p><div class="actions">${button("edit-task", "Record this task", "primary bedside-button", `data-id="${esc(next.id)}"`)}${button("skip-task", "Skip", "secondary", `data-id="${esc(next.id)}"`)}</div>` : `<h2 id="next-task-title">${day.today.length ? "Today’s tasks are recorded." : "No tasks scheduled for today."}</h2><p>${day.today.length ? `${day.completed.length} completed · ${day.skipped.length} skipped.` : "Check the schedule or open Records to see the plan’s dates."}</p><button type="button" class="secondary bedside-button" data-tab="records">View care records</button>`}</section><section class="card"><div class="section-title"><div><h2>Still to record today</h2><p class="muted">${day.pending.length} task${day.pending.length === 1 ? "" : "s"} · ${esc(date)}</p></div></div>${day.pending.length ? day.pending.map((t) => taskRow(t, true)).join("") : '<p class="empty-line">No pending tasks for today.</p>'}</section>${day.recorded.length ? `<details class="card recorded-today"><summary>Recorded today · ${day.recorded.length} task${day.recorded.length === 1 ? "" : "s"}</summary>${day.recorded.map((t) => taskRow(t, true)).join("")}</details>` : ""}${state.plan.flags?.length ? `<section class="card flags"><h2>Care instructions</h2>${state.plan.flags.map((f) => `<p>${esc(f)}</p>`).join("")}</section>` : ""}</div>`)
  );
}
function taskRow(t, bedside = false) {
  const late =
    t.status === "todo" && Date.parse(t.dueAt) < Date.now() - 3600000;
  return `<article class="task ${bedside ? "bedside-task" : ""} ${t.status === "done" ? "completed" : ""}" data-task-id="${esc(t.id)}"><div class="time">${esc(bedside ? timeLabel(t.dueAt) : t.time)}<small>${esc(t.kind)}</small></div><div class="task-detail"><b>${esc(t.label)}</b><small>${esc(taskSummary(t))}</small>${t.value ? `<p>${esc(typeof t.value === "object" ? t.value.amount + " " + t.value.unit : t.value)}</p>` : ""}${t.note ? `<p class="muted">${esc(t.note)}</p>` : ""}</div><span class="badge ${late ? "late" : ""}">${late ? "Past due" : t.status === "done" ? "Completed" : t.status === "skipped" ? "Skipped" : "Pending"}</span>${button("edit-task", t.status === "todo" ? "Record task" : "Edit record", "secondary", `data-id="${esc(t.id)}" aria-label="${t.status === "todo" ? "Record task" : "Edit record"}: ${esc(t.label)}"`)}</article>`;
}
function newDraft() {
  return {
    patient: state.profile.patient,
    startDate: state.profile.startDate,
    timeZone: state.profile.timeZone,
    prefs: { ...state.profile.prefs },
    meds: [],
    followups: [],
    flags: [],
    unresolved: [],
    monitoring: { weight: false, symptoms: false },
  };
}
function medEditor(m, i) {
  return `<tbody class="med-editor" data-med="${i}"><tr>
 <td>${field("Medication name", `drug-${i}`, m.drug, "text", "required")}</td>
 <td>${field("Dose as written", `dose-${i}`, m.dose, "text", "required")}</td>
 <td>${select("Frequency", `freq-${i}`, m.freq, [["", "Choose frequency"], ...FREQUENCIES])}</td>
 <td>${select("Food instruction", `meal-${i}`, m.meal, [
   ["any", "No food rule"],
   ["with", "With food"],
   ["before", "Before food"],
   ["after", "After food"],
 ])}</td>
 <td>${field("Separate from medication", `gapTarget-${i}`, m.gapTarget, "text", 'list="med-names" placeholder="Medication name"')}</td>
 <td>${field("Minimum gap (hours)", `gapHours-${i}`, m.gapHours ?? "", "number", 'min="0.25" max="24" step="0.25"')}</td>
 <td>${button("remove-med", "Remove", "text danger", `data-index="${i}"`)}</td></tr>
 <tr class="med-detail-row"><td colspan="7">${m.issue ? `<p class="notice">${esc(m.issue)}</p>` : ""}<div class="med-review-tools"><label class="check"><input name="reviewed-${i}" type="checkbox" ${m.reviewed ? "checked" : ""}>Checked against original instructions</label><details><summary>Timing details and source</summary><div class="grid three">${select(
   "Which meal",
   `mealTarget-${i}`,
   m.mealTarget || "any",
   [
     ["any", "Any selected meal"],
     ["breakfast", "Breakfast"],
     ["lunch", "Lunch"],
     ["dinner", "Dinner"],
   ],
 )}${field("Start date (optional)", `startDate-${i}`, m.startDate, "date")}${field("Stop after (optional)", `endDate-${i}`, m.endDate, "date")}</div>${m.source ? `<blockquote>${esc(m.source)}</blockquote>` : ""}</details></div></td></tr></tbody>`;
}
function followupEditor(f, i) {
  return `<tr><td>${field("Provider", `provider-${i}`, f.provider)}</td><td>${field("Due within (days)", `days-${i}`, f.days, "number", 'min="0" max="365"')}</td><td>${select(
    "Appointment status",
    `confirmed-${i}`,
    String(f.confirmed),
    [
      ["false", "Needs booking"],
      ["true", "Already booked"],
    ],
  )}</td><td>${field("Confirmed date", `fdate-${i}`, f.date, "date")}</td><td>${field("Confirmed time", `ftime-${i}`, f.time, "time")}</td><td>${button("remove-followup", "Remove follow-up", "text danger", `data-index="${i}"`)}</td></tr>`;
}
function planView() {
  if (!draft) {
    draft = state.plan ? structuredClone(state.plan) : newDraft();
    draftVersion = state.version;
  }
  return (
    heading(
      "Read discharge instructions",
      "",
      button("reload-plan", "Reload saved plan", "secondary"),
    ) +
    `<section class="card"><h2>1. Paste instructions</h2><label>Discharge text (English)<textarea id="raw-text" rows="7" placeholder="MEDICATIONS&#10;Medication name 10 mg once daily">${esc(draft.rawText || "")}</textarea></label><div class="actions">${button("parse", "Read instructions", "primary bedside-button")}${button("manual", "Enter manually", "secondary")}${button("sample", "Load fictional example", "secondary")}<label class="file-label">Load .txt<input id="text-upload" type="file" accept=".txt,text/plain"></label></div><details class="format-help"><summary>Supported format</summary><p>Use a MEDICATIONS heading and one medicine per line. Photos and scanned PDFs are not read here.</p><pre>MEDICATIONS
Example A 10 mg once daily
FOLLOW UP
Primary care in 7 days</pre><p>Reading text changes the draft below. It does not change the saved plan.</p></details></section><form id="plan-form"><section class="card"><h2 id="review-heading" tabindex="-1">2. Review the care plan</h2><p class="muted">${draft.meds.length} medicines · ${draft.followups.length} follow-ups</p><div class="grid three">${field("Patient name", "patient", draft.patient, "text", "required")}${field("Plan start date", "startDate", draft.startDate, "date", "required")}${select("Patient’s time zone", "timeZone", draft.timeZone, [...new Set([draft.timeZone, ...Intl.supportedValuesOf("timeZone")])])}</div>${draft.unresolved?.length ? `<section class="notice"><h3>Instructions requiring review</h3>${draft.unresolved.map((u, i) => `<label class="check"><input name="resolve-${i}" type="checkbox" ${u.resolved ? "checked" : ""}><span>${esc(u.reason)} ${u.text ? `<q>${esc(u.text)}</q>` : ""}<small>I entered this manually, or verified it is outside the supported plan.</small></span></label>`).join("")}</section>` : ""}<datalist id="med-names">${draft.meds.map((m) => `<option value="${esc(m.drug)}">`).join("")}</datalist><div class="table-scroll"><table class="review-table"><thead><tr><th>Medication</th><th>Dose</th><th>How often</th><th>Food</th><th>Separate from</th><th>Gap (h)</th><th></th></tr></thead>${draft.meds.map(medEditor).join("")}</table></div>${button("add-med", "+ Add medication", "secondary")}<details><summary>Meal and routine times</summary><p class="muted">“Twice daily” uses daytime slots at least four hours apart. For exact intervals, enter “every 12 hours.”</p><div class="grid three">${Object.keys(
      DEFAULT_PREFS,
    )
      .map((k) =>
        field(
          k[0].toUpperCase() + k.slice(1),
          `pref-${k}`,
          draft.prefs[k],
          "time",
          "required",
        ),
      )
      .join(
        "",
      )}</div></details><h3>Follow-ups</h3><p class="muted">Not booked: a booking deadline. Already booked: the appointment date.</p><div class="table-scroll"><table class="followup-table"><thead><tr><th>Provider</th><th>Within (days)</th><th>Status</th><th>Booked date</th><th>Booked time</th><th></th></tr></thead><tbody>${draft.followups.map(followupEditor).join("")}</tbody></table></div>${button("add-followup", "+ Add follow-up", "secondary")}<h3>Daily monitoring</h3><label class="check"><input name="weight" type="checkbox" ${draft.monitoring?.weight ? "checked" : ""}>Record daily weight</label><label class="check"><input name="symptoms" type="checkbox" ${draft.monitoring?.symptoms ? "checked" : ""}>Record daily symptoms</label><label>Clinician’s warning / escalation instructions (one per line)<textarea name="flags" rows="4">${esc(draft.flags.join("\n"))}</textarea></label></section><section class="card"><h2>3. Save the plan</h2><div class="actions">${button("preview", "Check schedule", "secondary")}<button class="primary bedside-button" type="submit">Save 30-day plan</button></div><div id="preview" aria-live="polite">${previewHTML()}</div></section></form>`
  );
}
function previewHTML() {
  if (!preview) return "";
  return preview.ok
    ? `<div class="success"><h3>Supported timing rules fit</h3>${draft.meds.map((m) => `<p><b>${esc(m.drug)}</b> · ${esc(preview.times[m.id]?.join(", "))}</p>`).join("")}</div>`
    : `<div class="alert"><h3>Review before publishing</h3>${preview.errors.map((e) => `<p>${esc(e)}</p>`).join("")}</div>`;
}
function collectDraft() {
  if (!$("#plan-form")) return;
  const f = new FormData($("#plan-form"));
  draft.rawText = $("#raw-text").value;
  for (const k of ["patient", "startDate", "timeZone"]) draft[k] = f.get(k);
  for (const k of Object.keys(DEFAULT_PREFS))
    draft.prefs[k] = f.get(`pref-${k}`);
  draft.meds = draft.meds.map((m, i) => ({
    ...m,
    ...Object.fromEntries(
      [
        "drug",
        "dose",
        "freq",
        "meal",
        "mealTarget",
        "gapTarget",
        "gapHours",
        "startDate",
        "endDate",
      ].map((k) => [k, String(f.get(`${k}-${i}`) || "").trim()]),
    ),
    reviewed: f.has(`reviewed-${i}`),
  }));
  draft.followups = draft.followups.map((v, i) => ({
    ...v,
    provider: f.get(`provider-${i}`),
    days: Number(f.get(`days-${i}`)),
    confirmed: f.get(`confirmed-${i}`) === "true",
    date: f.get(`fdate-${i}`),
    time: f.get(`ftime-${i}`),
  }));
  draft.flags = String(f.get("flags") || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  draft.monitoring = { weight: f.has("weight"), symptoms: f.has("symptoms") };
  draft.unresolved = (draft.unresolved || []).map((u, i) => ({
    ...u,
    resolved: f.has(`resolve-${i}`),
  }));
}
function chosenDay(value) {
  const days = planDays(state.plan, state.tasks);
  return days.some((d) => d.date === value)
    ? value
    : days.some((d) => d.date === localDate())
      ? localDate()
      : state.plan.startDate;
}
function dateLabel(date) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
}
function timelineView(date) {
  const groups = timelineGroups(state.tasks, date);
  if (!groups.length) return '<p class="empty-line">No tasks on this day.</p>';
  const items = state.tasks
    .filter((t) => !t.archived && t.date === date)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return `<div class="day-diagram" role="img" aria-label="Daily schedule timeline for ${esc(date)}. A text agenda follows."><div class="diagram-axis"><span>12 AM</span><span>6 AM</span><span>Noon</span><span>6 PM</span><span>12 AM</span></div>${groups.map((group) => `<div class="diagram-row"><b>${esc(group.label)}</b><div class="diagram-track"><svg class="diagram-svg" width="100%" height="48" aria-hidden="true">${group.slots.map((slot) => `<g class="diagram-pin ${slot.status === "done" ? "is-done" : ""}"><circle cx="${slot.percent}%" cy="14" r="7"></circle><text x="${slot.percent}%" y="40" text-anchor="middle">${esc(slot.time)}</text></g>`).join("")}</svg></div></div>`).join("")}</div><ol class="mobile-day-diagram" aria-label="Daily schedule timeline">${items.map((t) => `<li><time>${esc(timeLabel(t.dueAt))}</time><span class="mobile-dot" aria-hidden="true"></span><span>${esc(t.label)}</span></li>`).join("")}</ol>`;
}
function scheduleView() {
  if (!state.plan)
    return (
      heading("Daily schedule", "Save your instructions to build a schedule.") +
      emptyView()
    );
  const p = state.plan;
  scheduleDate = chosenDay(scheduleDate);
  const tasks = state.tasks
    .filter((t) => !t.archived && t.date === scheduleDate)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const example = ruleDemo ? conflictExample(p) : null;
  return (
    heading(
      "Daily schedule",
      "",
      button("calendar", "Export calendar", "secondary"),
    ) +
    `<section class="card"><div class="section-title"><h2>Your day at a glance</h2><label>Schedule date<input id="schedule-date" type="date" value="${esc(scheduleDate)}" min="${esc(p.startDate)}" max="${addDays(p.startDate, 29)}"></label></div>${timelineView(scheduleDate)}</section><details class="card"><summary>Tasks for this day</summary>${tasks.map((t) => taskRow(t, true)).join("") || "<p>No tasks on this date.</p>"}</details><section class="card medicine-rules"><h2>Medicine timing rules</h2><div class="table-scroll"><table><thead><tr><th>Medication</th><th>How often</th><th>Food</th><th>Spacing</th><th>Scheduled time</th></tr></thead><tbody>${p.meds.map((m) => `<tr><td><b>${esc(m.drug)}</b><small>${esc(m.dose)}</small></td><td>${esc(m.freq)}</td><td>${esc(m.meal === "any" ? "—" : m.meal + " " + (m.mealTarget && m.mealTarget !== "any" ? m.mealTarget : "food"))}</td><td>${m.gapTarget ? `${esc(m.gapHours)}h from ${esc(m.gapTarget)}` : "—"}</td><td><b>${p.compiled.times[m.id].map(esc).join(", ")}</b></td></tr>`).join("")}</tbody></table></div><div class="actions">${button("rebuild-schedule", "Rebuild schedule", "secondary")}<button type="button" class="secondary" data-tab="plan">Edit instructions</button></div></section><details class="card rule-example" ${ruleDemo ? "open" : ""}><summary>Try a timing conflict</summary><p class="muted">Example only. Your saved plan will not change.</p>${button("show-rule-demo", "Show timing conflict", "secondary")}${ruleDemo ? (example ? `<div class="alert" role="status"><b>Timing conflict</b><p>${esc(example.message)}</p><div class="conflict-pair"><span>${esc(example.a)} · ${esc(example.time)}</span><span>${esc(example.b)} · ${esc(example.time)}</span></div></div>${button("clear-rule-demo", "Clear example", "secondary")}` : '<p class="notice">Add a spacing rule between two medicines to try this example.</p>') : ""}</details>`
  );
}
function filteredPlanTasks(tasks) {
  return tasks.filter(
    (t) =>
      (planStatus === "all" || t.status === planStatus) &&
      (planCaregiver === "all" || t.who === planCaregiver),
  );
}
function planTaskRow(task) {
  const late =
    task.status === "todo" && Date.parse(task.dueAt) < Date.now() - 3600000;
  const assignment =
    task.status !== "todo"
      ? `<span>${esc(state.team.find((person) => person.id === task.who)?.name || "Unassigned")}</span>`
      : `<label class="inline-assignment"><span class="visually-hidden">Assigned caregiver</span><select data-assign-task="${esc(task.id)}" aria-label="Assign ${esc(task.label)} on ${esc(task.date)}"><option value="">Unassigned</option>${state.team
          .filter((p) => !p.archived)
          .map(
            (p) =>
              `<option value="${esc(p.id)}" ${task.who === p.id ? "selected" : ""}>${esc(p.name)}</option>`,
          )
          .join("")}</select></label>`;
  return `<tr class="plan-task ${late ? "past-due-row" : ""}" data-task-id="${esc(task.id)}"><td class="time">${esc(task.time)}</td><td><b>${esc(task.label)}</b>${task.actualAt ? `<small>${esc(taskSummary(task))}</small>` : ""}${task.value ? `<small>${esc(typeof task.value === "object" ? task.value.amount + " " + task.value.unit : task.value)}</small>` : ""}${task.note ? `<small>${esc(task.note)}</small>` : ""}</td><td>${assignment}</td><td><span class="badge ${late ? "late" : ""}">${late ? "Past due" : task.status === "done" ? "Completed" : task.status === "skipped" ? "Skipped" : "Pending"}</span></td><td><div class="actions">${button("edit-task", task.status === "todo" ? "Record task" : "Edit record", "secondary", `data-id="${esc(task.id)}" aria-label="${task.status === "todo" ? "Record task" : "Edit record"}: ${esc(task.label)}"`)}${task.status === "todo" ? button("skip-task", "Skip", "text", `data-id="${esc(task.id)}" aria-label="Record as skipped: ${esc(task.label)}"`) : ""}</div></td></tr>`;
}
function planTaskTable(tasks) {
  return tasks.length
    ? `<div class="table-scroll"><table class="task-table"><thead><tr><th>Time</th><th>Task</th><th>Assigned</th><th>Status</th><th>Action</th></tr></thead><tbody>${tasks.map(planTaskRow).join("")}</tbody></table></div>`
    : '<p class="muted">No matching tasks.</p>';
}
function monthView() {
  if (!state.plan)
    return (
      heading("30-day plan", "Save your instructions first.") + emptyView()
    );
  const days = planDays(state.plan, state.tasks);
  if (
    planCaregiver !== "all" &&
    planCaregiver !== "" &&
    !state.team.some((p) => !p.archived && p.id === planCaregiver)
  )
    planCaregiver = "all";
  planDate = chosenDay(planDate);
  const selected = days.find((day) => day.date === planDate),
    shown = planAllDays ? days : [selected];
  const total = days.reduce((sum, d) => sum + d.total, 0),
    done = days.reduce((sum, d) => sum + d.done, 0);
  const outside = state.tasks.filter(
    (t) =>
      !t.archived &&
      (t.date < state.plan.startDate ||
        t.date > addDays(state.plan.startDate, 29)) &&
      t.kind === "visit",
  );
  return (
    heading(
      "30-day plan",
      `${total} tasks · ${done} completed`,
      button("calendar", "Export calendar", "secondary"),
    ) +
    warningsView() +
    `<section class="plan-date-picker"><label>Choose a day<select id="plan-day">${days.map((day) => `<option class="plan-day" value="${day.date}" ${day.date === planDate ? "selected" : ""}>${esc(dateLabel(day.date))} · ${day.done}/${day.total} done</option>`).join("")}</select></label></section><section class="card"><div class="section-title"><h2>${planAllDays ? "All 30 days" : esc(dateLabel(planDate))}</h2>${button("all-plan-days", planAllDays ? "Show selected day" : "Show all 30 days", "secondary")}</div><div class="plan-filters">${select(
      "Task status",
      "plan-status",
      planStatus,
      [
        ["all", "All tasks"],
        ["todo", "Pending"],
        ["done", "Completed"],
        ["skipped", "Skipped"],
      ],
    )}${select("Assigned caregiver", "plan-caregiver", planCaregiver, [["all", "Everyone"], ["", "Unassigned"], ...state.team.filter((p) => !p.archived).map((p) => [p.id, p.name])])}</div>${shown.map((day) => `<section class="plan-date-group"><h3>${esc(dateLabel(day.date))}</h3>${planTaskTable(filteredPlanTasks(day.tasks))}</section>`).join("")}</section>${outside.length ? `<section class="card"><h2>Follow-ups outside these 30 days</h2>${outside.map((t) => `<h3>${esc(dateLabel(t.date))}</h3>${planTaskTable([t])}`).join("")}</section>` : ""}`
  );
}
function teamView() {
  const loads = caregiverLoads(state.team, state.tasks),
    max = Math.max(1, ...loads.map((p) => p.total));
  return (
    heading(
      "Care team load",
      "",
      '<button type="button" class="secondary" data-tab="month">Assign tasks</button>',
    ) +
    `<section class="card"><div class="table-scroll"><table class="workload-table"><thead><tr><th>Caregiver</th><th>Load</th><th>Tasks</th><th>Done</th><th>Rate</th><th>Active days</th></tr></thead><tbody>${loads.map((person) => `<tr class="load-row"><td><b>${esc(person.name)}</b></td><td><div class="load-track" aria-hidden="true"><svg width="100%" height="10"><rect width="${(person.total / max) * 100}%" height="10"></rect></svg></div></td><td>${person.total}</td><td>${person.done}</td><td>${person.rate}%</td><td>${person.activeDays}</td></tr>`).join("")}</tbody></table></div></section><section class="card"><form id="caregiver-form"><h2>Add a caregiver</h2>${field("Caregiver name", "name", "", "text", 'required maxlength="100"')}<button type="submit" class="primary">Add caregiver</button></form></section><div class="team-grid">${state.team
      .filter((m) => !m.archived)
      .map(
        (m) =>
          `<section class="card person"><span class="avatar large">${esc(m.name[0])}</span><h2>${esc(m.name)}</h2>${m.id !== "patient" ? button("rename-caregiver", "Rename", "secondary", `data-id="${esc(m.id)}"`) + button("remove-caregiver", "Remove", "text danger", `data-id="${esc(m.id)}"`) : '<p class="muted">Patient / self</p>'}</section>`,
      )
      .join("")}</div>`
  );
}
function calendarView() {
  if (!state.plan)
    return heading("Calendar", "Save your instructions first.") + emptyView();
  calendarMonthValue ||= chosenDay(calendarDate).slice(0, 7);
  const month = calendarMonth(calendarMonthValue, state.tasks);
  calendarDate = calendarDate.startsWith(calendarMonthValue)
    ? calendarDate
    : month.days.find((d) => d.total)?.date || calendarMonthValue + "-01";
  const tasks = state.tasks
    .filter((t) => !t.archived && t.date === calendarDate)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return (
    heading(
      "Calendar",
      "",
      button("calendar", "Download calendar (.ics)", "primary bedside-button"),
    ) +
    `<section class="card"><div class="section-title"><h2>${esc(new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(calendarMonthValue + "-01T12:00:00Z")))}</h2><label>Calendar month<input id="calendar-month" type="month" value="${esc(calendarMonthValue)}"></label></div><div class="calendar-scroll"><div class="calendar-board">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<span class="calendar-weekday">${d}</span>`).join("")}${Array.from({ length: month.offset }, () => '<span aria-hidden="true"></span>').join("")}${month.days.map((day) => `<button type="button" class="calendar-day ${day.date === calendarDate ? "selected" : ""}" data-calendar-day="${day.date}" aria-pressed="${day.date === calendarDate}" aria-label="${esc(dateLabel(day.date))}: ${day.total} tasks"><b>${day.number}</b><small>${day.total ? day.total + " tasks" : "—"}</small></button>`).join("")}</div></div></section><section class="card"><h2>${esc(dateLabel(calendarDate))}</h2>${tasks.map((t) => taskRow(t)).join("") || '<p class="muted">No tasks on this date.</p>'}</section><details class="card"><summary>About calendar reminders</summary><p>The file includes pending tasks and a reminder 15 minutes before each one. Import it into your calendar and check its notification settings.</p><p class="muted">This is a snapshot. Remove the old import before replacing it. Importing into a cloud calendar can copy care details outside this tablet.</p></details>`
  );
}
function matchingRecords() {
  const q = recordQuery.trim().toLowerCase();
  return state.tasks.filter(
    (t) =>
      (!t.archived || t.status !== "todo") &&
      (!filter || t.date === filter) &&
      (
        t.label +
        " " +
        t.date +
        " " +
        t.status +
        " " +
        (t.recordedByName || "") +
        " " +
        (t.note || "")
      )
        .toLowerCase()
        .includes(q),
  );
}
function recordList() {
  const tasks = matchingRecords();
  return {
    html:
      tasks
        .slice(0, 100)
        .map(
          (t) => `<div class="record-date">${esc(t.date)}</div>${taskRow(t)}`,
        )
        .join("") ||
      '<p class="empty-line">No matching records. Try another date or clear the filters.</p>',
    count: `Showing ${Math.min(tasks.length, 100)} of ${tasks.length} matching tasks.`,
  };
}
function recordsView() {
  const list = recordList();
  return (
    heading("Records") +
    warningsView() +
    `<section class="card"><div class="record-filters"><label>Search records<input id="record-search" value="${esc(recordQuery)}" placeholder="Medication, caregiver, or note"></label><label>Filter by date<input id="day-filter" type="date" value="${esc(filter)}"></label>${button("clear-filters", "Clear filters", "secondary")}</div><p id="record-count" class="muted" aria-live="polite">${list.count}</p><div id="record-list">${list.html}</div></section><section class="card"><h2>Recent activity</h2>${state.audit
      .slice(0, 50)
      .map(
        (a) =>
          `<p>${esc(a.action)}<small>${esc(a.name || "On this device")} · ${esc(fmt(a.at))}</small>${a.details ? `<small>Change: ${esc(JSON.parse(a.details).before.status)} → ${esc(JSON.parse(a.details).after.status)} · actual time ${esc(JSON.parse(a.details).before.actualAt || "not recorded")} → ${esc(JSON.parse(a.details).after.actualAt || "not recorded")}</small>` : ""}</p>`,
      )
      .join("")}</section>`
  );
}
function deviceStatusView() {
  const device = getDeviceStatus();
  const title = device.ready
    ? "Ready for offline use"
    : device.preparing
      ? "Preparing offline files…"
      : "Offline use is not ready";
  const persistence =
    device.persistence === "granted"
      ? "Protected from automatic browser cleanup"
      : device.persistence === "checking"
        ? "Checking storage protection…"
        : device.persistence === "unavailable"
          ? "Storage protection is unavailable in this browser"
          : "Storage protection has not been granted";
  return `<section class="card device-status" id="device-status" data-offline-ready="${device.ready}" data-persistence="${device.persistence}" data-update-ready="${device.updateReady}"><h2>Install and use offline</h2><p class="device-readiness ${device.ready ? "ready" : ""}" role="status">${title}</p>${device.error ? `<p class="notice">${esc(device.error)}</p>` : ""}${!device.ready && !device.preparing && device.supported ? button("prepare-offline", "Prepare offline app", "secondary") : ""}${device.installed ? '<p class="success">Installed.</p>' : device.canInstall ? button("install-app", "Install CareLoop on this device") : '<p class="muted">Install from your browser menu. On iPad: Share → Add to Home Screen.</p>'}<h3>Storage protection</h3><p class="storage-protection">${persistence}</p><p class="muted">Keep a backup even when storage is protected.</p>${device.persistence === "not-granted" ? button("protect-storage", "Ask browser to protect local storage", "secondary") : ""}<h3>App updates</h3>${device.updateReady ? '<p class="notice">Update ready. Save your work, close all CareLoop windows, and reopen.</p>' : '<p class="muted">Updates apply after all CareLoop windows close.</p>'}${device.supported ? button("check-updates", "Check for app updates", "secondary") : ""}<details><summary>Tablet setup help</summary><p>First installation needs an HTTPS address. A laptop’s localhost address works only on that laptop.</p></details></section>`;
}
function renderDeviceStatus() {
  const panel = $("#device-status");
  if (panel) {
    const focused = panel.contains(document.activeElement)
      ? document.activeElement.dataset.action
      : null;
    panel.outerHTML = deviceStatusView();
    if (focused) {
      const replacement = document.querySelector(
        `#device-status [data-action="${focused}"]`,
      );
      if (replacement) replacement.focus({ preventScroll: true });
      else {
        const updated = $("#device-status");
        updated.tabIndex = -1;
        updated.focus({ preventScroll: true });
      }
    }
  }
}
function settingsView() {
  return (
    heading("Settings") +
    deviceStatusView() +
    `<section class="card"><h2>Reminders</h2><p>Requires this page to stay open and the device awake.</p>${button("reminders", "Enable reminders while this page is open", "secondary")}</section>
    <section class="card"><h2>Backup and restore</h2><div class="actions">${button("backup", "Save encrypted backup", "secondary")}<label class="file-label">Restore bedside backup<input type="file" id="backup-upload" accept=".json,application/json"></label></div><hr><h3>Delete care data</h3>${button("reset", "Review data deletion", "danger-button")}</section>
    <details class="card"><summary>About CareLoop and privacy</summary><p>Records stay in this browser. Anyone using it can read or change them. Use a screen lock and keep a backup; clearing browser data deletes the record.</p><p>Backups are encrypted with a passphrase. The working record is not separately encrypted. Calendar exports are separate copies and can leave this device when imported into a cloud calendar.</p><p>CareLoop organizes English instructions into 30-day plans. It does not diagnose or check every medication interaction. Photos, translation, and remote family access are not supported. Clinical validation has not been performed; use fictional data while testing.</p></details>`
  );
}
function updateRecordForm() {
  const form = $("#task-form");
  if (!form) return;
  const status = new FormData(form).get("status"),
    recording = status !== "todo";
  form.querySelector(".record-fields").hidden = !recording;
  form.querySelector(".measurement-fields").hidden = status !== "done";
  for (const name of ["recordedBy", "actualAt"]) {
    const control = form.elements.namedItem(name);
    control.required = recording;
    control.disabled = !recording;
  }
  const value = form.elements.namedItem("value");
  if (value) value.required = status === "done";
  for (const control of form.querySelectorAll(
    ".measurement-fields input, .measurement-fields select, .measurement-fields textarea",
  ))
    control.disabled = status !== "done";
  form.querySelector('[type="submit"]').textContent =
    status === "done"
      ? "Save completed record"
      : status === "skipped"
        ? "Save skipped record"
        : "Save assignment / reopen task";
}
function editTask(id, intent) {
  const t = state.tasks.find((t) => t.id === id);
  const dialog = document.createElement("dialog");
  dialog.id = "task-dialog";
  dialog.dataset.version = state.version;
  const status = intent || (t.status === "todo" ? "done" : t.status);
  const actual = t.actualAt
    ? localInput(t.actualAt)
    : t.date === localDate()
      ? localInput()
      : "";
  const people = state.team
    .filter((m) => !m.archived)
    .map((m) => [m.id, m.name]);
  dialog.setAttribute("aria-labelledby", "record-title");
  dialog.setAttribute("aria-describedby", "record-schedule");
  dialog.innerHTML = `<form id="task-form"><h2 id="record-title">${esc(t.label)}</h2><p id="record-schedule">Scheduled ${esc(fmt(t.dueAt))}</p>${t.date !== localDate() ? '<p class="notice">This task is from a different day. Enter when it actually happened.</p>' : ""}${t.source ? `<details class="task-source"><summary>Original instruction</summary><p>${esc(t.source)}</p></details>` : ""}<input name="id" type="hidden" value="${esc(id)}"><fieldset class="record-choice"><legend>What happened?</legend>${[
    ["done", "Completed"],
    ["skipped", "Skipped"],
    ["todo", "Leave pending / assignment only"],
  ]
    .map(
      ([value, label]) =>
        `<label><input type="radio" name="status" value="${value}" ${value === status ? "checked" : ""}><span>${label}</span></label>`,
    )
    .join(
      "",
    )}</fieldset><div class="record-fields">${select("Recorded by", "recordedBy", t.recordedBy || "", [["", "Choose who is recording"], ...people])}${field("Actual time (device time)", "actualAt", actual, "datetime-local")}</div><div class="measurement-fields">${t.kind === "weight" ? field("Recorded weight", "value", t.value?.amount || "", "number", 'min="0.01" step="0.01"') + select("Unit", "unit", t.value?.unit || "kg", ["kg", "lb"]) : t.kind === "symptoms" ? `<label>Symptoms (write “none” if none)<textarea name="value">${esc(t.value || "")}</textarea></label>` : ""}</div><details class="assignment-details" ${t.note ? "open" : ""}><summary>Assignment and notes</summary>${select("Assigned caregiver", "who", t.who, [["", "Unassigned"], ...people])}<label>Note / reason for correction<textarea name="note">${esc(t.note)}</textarea></label></details><p id="task-error" class="alert" role="alert" tabindex="-1" hidden></p><div class="actions record-actions"><button type="submit" class="primary bedside-button">Save completed record</button>${button("close-dialog", "Cancel", "secondary")}</div></form>`;
  document.body.append(dialog);
  updateRecordForm();
  dialog.showModal();
  dialog.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });
  dialog.addEventListener("close", () => dialog.remove());
}
app.addEventListener("click", async (e) => {
  const nav = e.target.closest("[data-tab]");
  if (nav) {
    if (tab === "plan") collectDraft();
    tab = nav.dataset.tab;
    draw();
    return;
  }
  const day = e.target.closest("[data-plan-day]");
  if (day) {
    planDate = day.dataset.planDay;
    planAllDays = false;
    draw();
    return;
  }
  const calendarDay = e.target.closest("[data-calendar-day]");
  if (calendarDay) {
    calendarDate = calendarDay.dataset.calendarDay;
    draw();
    return;
  }
  const b = e.target.closest("[data-action]");
  if (!b) return;
  await action(b.dataset.action, b);
});
document.addEventListener("click", (e) => {
  if (!busy && e.target.closest('[data-action="close-dialog"]'))
    $("#task-dialog")?.close();
});
async function action(action, b) {
  if (busy) return;
  try {
    if (action === "prepare-offline") {
      await prepareOffline();
      renderDeviceStatus();
    }
    if (action === "protect-storage") {
      const granted = await requestStorageProtection();
      renderDeviceStatus();
      toast(
        granted
          ? "Browser storage protection granted. Keep a private backup too."
          : "The browser did not grant storage protection. Your record is still local; keep a private backup.",
      );
    }
    if (action === "install-app") {
      const accepted = await installApp();
      renderDeviceStatus();
      toast(
        accepted
          ? "Installation requested. Your browser will confirm it."
          : "Installation was not confirmed. You can use the browser’s home-screen menu instead.",
      );
    }
    if (action === "check-updates") {
      await checkForUpdates();
      renderDeviceStatus();
      toast(
        getDeviceStatus().updateReady
          ? "Update ready. Close all CareLoop windows after saving your work."
          : "Update check finished. Offline status is shown above.",
      );
    }
    if (action === "manual") {
      collectDraft();
      draft.meds.push({
        id: crypto.randomUUID(),
        drug: "",
        dose: "",
        freq: "",
        meal: "any",
        gapTarget: "",
        gapHours: "",
        reviewed: false,
      });
      preview = null;
      draw();
      $("[data-med]:last-of-type input")?.focus();
    }
    if (action === "all-plan-days") {
      planAllDays = !planAllDays;
      draw();
    }
    if (action === "skip-task") editTask(b.dataset.id, "skipped");
    if (action === "show-rule-demo") {
      ruleDemo = true;
      draw();
    }
    if (action === "clear-rule-demo") {
      ruleDemo = false;
      draw();
    }
    if (action === "rebuild-schedule") {
      await commit({ type: "plan", plan: state.plan });
      ruleDemo = false;
      await refresh();
      toast("Schedule rebuilt. Completed records were kept.");
    }
    if (action === "clear-filters") {
      filter = "";
      recordQuery = "";
      draw();
    }
    if (action === "earlier-records") {
      filter = b.dataset.date;
      recordQuery = "";
      tab = "records";
      draw();
    }
    if (action === "retry-storage") {
      await refresh();
      return;
    }
    if (action === "reload-plan") {
      if (!confirm("Discard this draft and reload the saved care plan?"))
        return;
      draft = null;
      preview = null;
      await refresh();
      return;
    }
    if (action === "calendar") {
      if (
        !confirm(
          "This file contains care details. Importing it into a cloud calendar can copy them outside this device. Export it?",
        )
      )
        return;
      download(
        "careloop.ics",
        toICS(state.tasks),
        "text/calendar;charset=utf-8",
      );
    }
    if (action === "backup") await recovery.openExport();
    if (action === "new-plan") {
      draft = newDraft();
      draftVersion = state.version;
      tab = "plan";
      draw();
    }
    if (action === "sample") {
      const res = await fetch("/sample.txt");
      $("#raw-text").value = await res.text();
      toast("Fictional example loaded. Read and review it before publishing.");
    }
    if (action === "parse") {
      collectDraft();
      const text = $("#raw-text").value;
      if (!text.trim()) throw new Error("Paste instructions first.");
      const parsed = parseDischarge(text);
      draft = { ...draft, ...parsed, rawText: text };
      preview = null;
      draw();
      $("#review-heading").focus({ preventScroll: true });
      $("#review-heading").scrollIntoView({ block: "start" });
    }
    if (
      [
        "add-med",
        "remove-med",
        "add-followup",
        "remove-followup",
        "preview",
      ].includes(action)
    ) {
      collectDraft();
      preview = null;
      if (action === "add-med")
        draft.meds.push({
          id: crypto.randomUUID(),
          drug: "",
          dose: "",
          freq: "",
          meal: "any",
          gapTarget: "",
          gapHours: "",
          reviewed: false,
        });
      if (action === "remove-med")
        draft.meds.splice(Number(b.dataset.index), 1);
      if (action === "add-followup")
        draft.followups.push({
          id: crypto.randomUUID(),
          provider: "",
          days: 7,
          confirmed: false,
          date: "",
          time: "",
        });
      if (action === "remove-followup")
        draft.followups.splice(Number(b.dataset.index), 1);
      if (action === "preview") preview = compilePlan(draft);
      draw();
      if (preview)
        $("#preview").scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (action === "edit-task") editTask(b.dataset.id);
    if (action === "rename-caregiver") {
      const person = state.team.find((m) => m.id === b.dataset.id);
      const name = prompt("Caregiver name", person.name);
      if (name === null) return;
      await commit({ type: "caregiver", id: person.id, name });
      await refresh();
    }
    if (action === "remove-caregiver") {
      if (
        !confirm(
          "Remove this caregiver name? Past records remain; pending tasks become unassigned.",
        )
      )
        return;
      await commit({ type: "remove-caregiver", id: b.dataset.id });
      await refresh();
    }
    if (action === "reminders") {
      if (!("Notification" in window))
        throw new Error(
          "This browser does not support page reminders. Use calendar export.",
        );
      if ((await Notification.requestPermission()) !== "granted")
        throw new Error(
          "Notification permission was not granted. Use calendar export.",
        );
      clearInterval(reminderTimer);
      const notified = new Set();
      reminderTimer = setInterval(() => {
        for (const t of (state?.tasks || []).filter(
          (t) => !t.archived && t.status === "todo",
        )) {
          const delta = Date.parse(t.dueAt) - Date.now();
          if (delta >= 0 && delta <= 900000 && !notified.has(t.id)) {
            new Notification("CareLoop: upcoming task", {
              body: "A care task is coming up. Open CareLoop to review the bedside record.",
            });
            notified.add(t.id);
          }
        }
      }, 15000);
      toast("Page reminders enabled while this page stays open and awake.");
    }
    if (action === "reset") await recovery.openDelete();
  } catch (e) {
    if (e.status === 409) await refresh();
    toast(e.message, true);
  }
}
document.addEventListener("submit", async (e) => {
  if (
    !["setup-form", "plan-form", "task-form", "caregiver-form"].includes(
      e.target.getAttribute("id"),
    )
  )
    return;
  e.preventDefault();
  if (busy) return;
  busy = true;
  const formButtons = [...e.target.querySelectorAll("button")];
  for (const control of formButtons) control.disabled = true;
  try {
    if (e.target.getAttribute("id") === "setup-form") {
      const data = new FormData(e.target);
      const profile = {
        patient: data.get("patient"),
        startDate: data.get("startDate"),
        timeZone: data.get("timeZone"),
        prefs: Object.fromEntries(
          Object.keys(DEFAULT_PREFS).map((k) => [k, data.get(`pref-${k}`)]),
        ),
      };
      await commit({
        type: "setup",
        profile,
        names: String(data.get("names") || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      history.replaceState({}, "", "/");
      await refresh();
      toast("Setup saved.");
    }
    if (e.target.getAttribute("id") === "caregiver-form") {
      await commit({
        type: "caregiver",
        name: new FormData(e.target).get("name"),
      });
      await refresh();
      toast("Caregiver saved.");
    }
    if (e.target.getAttribute("id") === "plan-form") {
      collectDraft();
      preview = compilePlan(draft);
      if (!preview.ok) {
        draw();
        $("#preview").scrollIntoView();
        return;
      }
      await commit({ type: "plan", plan: draft }, draftVersion);
      draft = null;
      preview = null;
      tab = "schedule";
      await refresh();
      toast("30-day plan saved. Completed records were kept.");
    }
    if (e.target.getAttribute("id") === "task-form") {
      const data = Object.fromEntries(new FormData(e.target));
      data.actualAt = data.actualAt
        ? new Date(data.actualAt).toISOString()
        : null;
      await commit(
        { type: "task", patch: data },
        Number($("#task-dialog").dataset.version),
      );
      $("#task-dialog").close();
      await refresh();
      toast("Record saved.");
    }
  } catch (err) {
    toast(err.message, true);
    if (e.target.getAttribute("id") === "task-form" && err.status !== 409) {
      const message = $("#task-error");
      message.textContent = err.message;
      message.hidden = false;
      message.focus();
    }
    if (err.status === 409) {
      if (e.target.getAttribute("id") === "task-form") {
        $("#task-dialog")?.close();
        await refresh();
        toast(
          "This record changed in another tab. The latest version is loaded. Open the task again before editing.",
          true,
        );
      } else if (e.target.getAttribute("id") !== "plan-form") {
        await refresh();
        toast(
          "This record changed in another tab. The latest saved record is loaded; review it before retrying.",
          true,
        );
      } else {
        await refresh(false);
        toast(
          err.message +
            " Your plan draft is still here. Use Reload saved plan after reviewing the latest schedule.",
          true,
        );
      }
    }
  } finally {
    busy = false;
    for (const control of formButtons)
      if (control.isConnected) control.disabled = false;
  }
});
document.addEventListener("change", (e) => {
  if (e.target.closest("#task-form") && e.target.name === "status")
    updateRecordForm();
});
app.addEventListener("change", async (e) => {
  try {
    if (e.target.id === "plan-day") {
      planDate = e.target.value;
      planAllDays = false;
      draw();
    }
    if (e.target.id === "schedule-date") {
      scheduleDate = e.target.value;
      draw();
    }
    if (e.target.name === "plan-status") {
      planStatus = e.target.value;
      draw();
    }
    if (e.target.name === "plan-caregiver") {
      planCaregiver = e.target.value;
      draw();
    }
    if (e.target.id === "calendar-month") {
      calendarMonthValue = e.target.value || state.plan.startDate.slice(0, 7);
      draw();
    }
    if (e.target.matches("[data-assign-task]")) {
      await commit({
        type: "task",
        patch: { id: e.target.dataset.assignTask, who: e.target.value },
      });
      await refresh();
      toast("Assignment saved.");
    }
    if (e.target.getAttribute("id") === "day-filter") {
      filter = e.target.value;
      draw();
    }
    if (e.target.getAttribute("id") === "text-upload") {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 200000)
          throw new Error("Use a text file under 200 KB.");
        $("#raw-text").value = await file.text();
      }
    }
    if (e.target.getAttribute("id") === "backup-upload") {
      const file = e.target.files[0];
      e.target.value = "";
      if (file) await recovery.openImport(file);
    }
  } catch (err) {
    if (err.status === 409) await refresh();
    toast(err.message, true);
  }
});
app.addEventListener("input", (e) => {
  if (e.target.getAttribute("id") === "record-search") {
    recordQuery = e.target.value;
    const list = recordList();
    $("#record-list").innerHTML = list.html;
    $("#record-count").textContent = list.count;
  }
  if (e.target.closest("[data-med]")) {
    const row = e.target.closest("[data-med]");
    if (e.target.type !== "checkbox")
      row.querySelector('[name^="reviewed-"]').checked = false;
  }
});
async function checkForLocalChanges() {
  try {
    const fresh = await loadRecord();
    if (fresh.version === state?.version) return;
    if (!fresh.profile) {
      clearInterval(reminderTimer);
      draft = null;
      preview = null;
      $("#task-dialog")?.close();
      recovery.cancel();
      state = fresh;
      tab = "today";
      filter = "";
      recordQuery = "";
      draw();
      toast("The care record was deleted in another tab.");
      return;
    }
    if (
      busy ||
      document.querySelector("dialog[open]") ||
      tab === "plan" ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
    ) {
      toast(
        "The record changed in another tab. Your unsaved work is preserved; reload the saved plan or reopen this task before saving.",
      );
      return;
    }
    state = fresh;
    draw();
  } catch (error) {
    toast(error.message, true);
  }
}
onRecordChange(checkForLocalChanges);
window.addEventListener("focus", checkForLocalChanges);
try {
  await refresh();
} catch (error) {
  storageFailure(error.message);
}

// Refresh the visible day/time while the bedside page is awake; never interrupt a form.
function refreshBedsideClock() {
  if (
    !state?.plan ||
    tab !== "today" ||
    busy ||
    document.querySelector("dialog[open]") ||
    document.hidden
  )
    return;
  const active = document.activeElement;
  if (active && active !== document.body && active.closest("#content")) return;
  const content = $("#content");
  if (content) content.innerHTML = today();
}
setInterval(refreshBedsideClock, 30000);
window.addEventListener("focus", refreshBedsideClock);

onDeviceStatus(renderDeviceStatus);
prepareOffline();
