import {
  FREQUENCIES,
  DEFAULT_PREFS,
  parseDischarge,
  compilePlan,
  logWarnings,
  toICS,
} from "/domain.js";
import { loadRecord, saveChange, onRecordChange } from "/storage.js";
import { makeBackup } from "/care-record.js";
import { bedsideDay } from "/bedside.js";

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
  renderedTab = null;
const app = $("#app");
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
  app.innerHTML = `<main class="setup"><a class="brand" href="/">✳ <span>CareLoop</span></a><div class="eyebrow">YOUR BEDSIDE CARE STATION</div><h1>One tablet.<br>One care record.</h1><p class="lead">Set up this device. No account or email address needed.</p><section class="card"><h2>Who are we caring for?</h2><form id="setup-form">${field("Patient name or nickname", "patient", "", "text", 'required maxlength="100" autocomplete="off"')}${field("Plan start date", "startDate", localDate(), "date", "required")}${select("Patient’s time zone", "timeZone", zone, [...new Set([zone, ...Intl.supportedValuesOf("timeZone")])])}<details><summary>Meal and routine times</summary><div class="grid three">${Object.entries(
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
    )}</div></details><label>Caregiver names (optional, one per line)<textarea name="names" rows="3" placeholder="Lan&#10;Minh"></textarea></label><p class="muted">Caregiver names are labels for this tablet, not verified identities. Anyone with access to this browser can use the record.</p><button type="submit" class="primary">Set up this device</button></form></section><p class="muted">Care information is saved in this browser on this device. Clearing site data or using a different browser will not preserve this record. Offline installation is coming in a later stage.</p></main>`;
}
function storageFailure(message) {
  app.innerHTML = `<main class="setup"><h1>Local storage needs attention.</h1><section class="alert" role="alert"><p>${esc(message)}</p><p>CareLoop has not started a temporary record. Your existing data has not been replaced.</p>${button("retry-storage", "Try opening storage again", "secondary")}</section></main>`;
}
function draw() {
  if (!state?.profile) {
    setup();
    return;
  }
  app.innerHTML = `<div class="shell"><aside><a class="brand" href="/">✳ <span>CareLoop</span></a><div class="team-label">${esc(state.profile.patient)} · Bedside tablet</div><nav aria-label="Main navigation">${[
    ["today", "◷", "Today"],
    ["schedule", "◴", "Schedule"],
    ["records", "☷", "Records"],
    ["manage", "⚙", "Manage care"],
  ]
    .map(
      ([key, icon, label]) =>
        `<button data-tab="${key}" class="nav-item ${key === tab || (key === "manage" && ["plan", "team", "settings"].includes(tab)) ? "active" : ""}" ${key === tab || (key === "manage" && ["plan", "team", "settings"].includes(tab)) ? 'aria-current="page"' : ""}><span aria-hidden="true">${icon}</span>${label}</button>`,
    )
    .join(
      "",
    )}</nav><div class="aside-bottom"><div><b>Saved on this device</b><small>No account · no remote sharing</small></div></div></aside><main class="main"><header><span class="eyebrow">THE NEXT 30 DAYS, TOGETHER</span><span class="sync">● Saved in this browser</span></header><div id="content">${["plan", "team", "settings"].includes(tab) ? `<div class="manage-breadcrumb"><button type="button" class="secondary" data-tab="manage">← Manage care</button><span>Care management · changes affect the saved plan</span></div>` : ""}${{ today: today, plan: planView, schedule: scheduleView, team: teamView, records: recordsView, settings: settingsView, manage: manageView }[tab]()}</div><footer>CareLoop organizes the instructions you enter. It does not diagnose, recommend treatment, or check all possible medication interactions.</footer></main></div>`;
  if (renderedTab !== tab) {
    window.scrollTo(0, 0);
    renderedTab = tab;
  }
}
function emptyView() {
  return `<section class="empty card"><span class="big-icon">✳</span><h2>One plan. Everyone on the same page.</h2><p>Start with the discharge paperwork. Review each instruction, build a schedule, and record care on this tablet.</p>${button("new-plan", "Create a care plan")}</section>`;
}
function heading(title, sub, actions = "") {
  return `<div class="heading"><div><h1>${title}</h1><p class="lead">${sub}</p></div>${actions}</div>`;
}
function warningsView() {
  const warnings = logWarnings(state.tasks, state.plan);
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
  return `${person ? "Assigned to " + person.name : "Unassigned"}${task.actualAt ? " · Recorded " + fmt(task.actualAt) + (task.recordedByName ? " by " + task.recordedByName : "") : ""}`;
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
  return (
    heading(
      "A clearer day ahead.",
      `${esc(dateLabel)} · Care for ${esc(state.profile.patient)} · ${esc(state.profile.timeZone)}`,
    ) +
    (!state.plan
      ? emptyView()
      : `<div class="bedside-view">${warningsView()}${day.earlier.length ? `<section class="earlier-notice"><div><b>${day.earlier.length} earlier task${day.earlier.length === 1 ? " has" : "s have"} no record yet</b><p>Review what happened on previous days.</p></div>${button("earlier-records", "Review earlier records", "secondary", `data-date="${esc(day.earlier[0].date)}"`)}</section>` : ""}<section class="card bedside-focus" aria-labelledby="next-task-title"><div class="focus-heading"><span class="eyebrow">${late ? "CHECK THIS TASK" : "NEXT ON TODAY’S PLAN"}</span><span class="badge ${late ? "late" : ""}">${late ? "Past due" : next ? "Pending" : "Today"}</span></div>${next ? `<div class="focus-time">${esc(timeLabel(next.dueAt))}</div><h2 id="next-task-title">${esc(next.label)}</h2><p>${esc(taskSummary(next))}</p><p class="focus-hint">${late ? "Record what actually happened. Check the original instructions for any questions about a missed task." : "Review the task, then record who did it and when."}</p>${button("edit-task", "Record this task", "primary bedside-button", `data-id="${esc(next.id)}"`)}<small>Nothing is marked complete until you save the record.</small>` : `<h2 id="next-task-title">${day.today.length ? "Today’s tasks are recorded." : "No tasks scheduled for today."}</h2><p>${day.today.length ? `${day.completed.length} completed · ${day.skipped.length} skipped. Your records are saved on this device.` : "Check the schedule or open Records to see the plan’s dates."}</p><button type="button" class="secondary bedside-button" data-tab="records">View care records</button>`}</section><div class="bedside-progress" aria-label="Today’s progress"><div><strong>${day.completed.length}</strong><span>Completed</span></div><div><strong>${day.pending.length}</strong><span>Still pending</span></div><div><strong>${day.skipped.length}</strong><span>Skipped</span></div></div><section class="card"><div class="section-title"><div><h2>Still to record today</h2><p class="muted">${day.pending.length} task${day.pending.length === 1 ? "" : "s"} · ${esc(date)}</p></div></div>${day.pending.length ? day.pending.map((t) => taskRow(t, true)).join("") : '<p class="empty-line">No pending tasks for today.</p>'}</section>${day.recorded.length ? `<details class="card recorded-today"><summary>Recorded today · ${day.recorded.length} task${day.recorded.length === 1 ? "" : "s"}</summary>${day.recorded.map((t) => taskRow(t, true)).join("")}</details>` : ""}${state.plan.flags?.length ? `<section class="card flags"><h2>Keep these instructions close</h2><p class="muted">Copied from your plan. Check the original paperwork for full instructions.</p>${state.plan.flags.map((f) => `<p>${esc(f)}</p>`).join("")}</section>` : ""}</div>`)
  );
}
function taskRow(t, bedside = false) {
  const late =
    t.status === "todo" && Date.parse(t.dueAt) < Date.now() - 3600000;
  return `<article class="task ${bedside ? "bedside-task" : ""} ${t.status === "done" ? "completed" : ""}" data-task-id="${esc(t.id)}"><div class="time">${esc(bedside ? timeLabel(t.dueAt) : t.time)}<small>${esc(t.kind)}</small></div><div class="task-detail"><b>${esc(t.label)}</b><small>${esc(taskSummary(t))}</small>${t.value ? `<p>${esc(typeof t.value === "object" ? t.value.amount + " " + t.value.unit : t.value)}</p>` : ""}${t.note ? `<p class="muted">${esc(t.note)}</p>` : ""}</div><span class="badge ${late ? "late" : ""}">${late ? "Past due" : t.status === "done" ? "Completed" : t.status === "skipped" ? "Skipped" : "Pending"}</span>${button("edit-task", t.status === "todo" ? "Record task" : "Edit record", "secondary", `data-id="${esc(t.id)}" aria-label="${t.status === "todo" ? "Record task" : "Edit record"}: ${esc(t.label)}"`)}</article>`;
}
function manageView() {
  const options = [
    [
      "plan",
      "▤",
      "Care plan",
      "Read discharge instructions, review medications, and publish a schedule.",
    ],
    [
      "team",
      "♧",
      "Caregivers",
      "Add or change the names used for assignment and recording.",
    ],
    [
      "settings",
      "⚙",
      "Device and data",
      "Reminders, calendar export, backups, restore, and data deletion.",
    ],
  ];
  return (
    heading(
      "Manage care.",
      "Make changes here, then return to Today for the daily routine.",
      '<button type="button" class="secondary" data-tab="today">Back to Today</button>',
    ) +
    `<div class="manage-grid">${options.map(([key, icon, label, description]) => `<section class="card manage-card"><span class="manage-icon" aria-hidden="true">${icon}</span><h2>${label}</h2><p>${description}</p><button type="button" class="primary" data-tab="${key}">Open ${label.toLowerCase()}</button></section>`).join("")}</div><p class="muted">This area helps prevent accidental changes during daily use. It is not locked; anyone using this browser can open it.</p>${draft ? '<p class="notice">You have a care plan draft in this open page. It is not saved until you publish it.</p>' : ""}`
  );
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
  return `<fieldset class="med-editor" data-med="${i}"><legend>Medication ${i + 1}</legend>${m.source ? `<blockquote><b>Original instruction</b><br>${esc(m.source)}</blockquote>` : ""}${m.issue ? `<p class="notice">${esc(m.issue)} Correct the fields, then confirm them below.</p>` : ""}<div class="grid three">${field("Medication name", `drug-${i}`, m.drug, "text", "required")}${field("Dose as written", `dose-${i}`, m.dose, "text", "required")}${select("Frequency", `freq-${i}`, m.freq, [["", "Choose frequency"], ...FREQUENCIES])}${select(
    "Food instruction",
    `meal-${i}`,
    m.meal,
    [
      ["any", "No food rule entered"],
      ["with", "With food (within 30 min)"],
      ["before", "15–60 min before food"],
      ["after", "15–60 min after food"],
    ],
  )}${select("Which meal", `mealTarget-${i}`, m.mealTarget || "any", [
    ["any", "Any selected meal"],
    ["breakfast", "Breakfast"],
    ["lunch", "Lunch"],
    ["dinner", "Dinner"],
  ])}${field("Separate from medication", `gapTarget-${i}`, m.gapTarget, "text", 'list="med-names" placeholder="Exact name, or leave blank"')}${field("Minimum gap (hours)", `gapHours-${i}`, m.gapHours ?? "", "number", 'min="0.25" max="24" step="0.25"')}${field("Start date (optional)", `startDate-${i}`, m.startDate, "date")}${field("Stop after (optional)", `endDate-${i}`, m.endDate, "date")}</div><div class="between"><label class="check"><input name="reviewed-${i}" type="checkbox" ${m.reviewed ? "checked" : ""}>I checked these fields against the original instructions.</label>${button("remove-med", "Remove", "text danger", `data-index="${i}"`)}</div></fieldset>`;
}
function planView() {
  if (!draft) {
    draft = state.plan ? structuredClone(state.plan) : newDraft();
    draftVersion = state.version;
  }
  return (
    heading(
      "From paperwork to a plan.",
      "Review every detail before publishing. Completed care records stay in the history.",
      button("reload-plan", "Reload saved plan", "secondary"),
    ) +
    `<section class="card"><h2>1. Bring in the instructions</h2><p class="muted">Paste English discharge text with MEDICATIONS and FOLLOW UP headings, or load a text file. Photos and scanned PDFs are not supported.</p><label>Discharge text<textarea id="raw-text" rows="6" placeholder="MEDICATIONS&#10;Medication name 10 mg once daily">${esc(draft.rawText || "")}</textarea></label><div class="actions">${button("parse", "Read instructions")}${button("sample", "Load fictional example", "secondary")}<label class="file-label">Load .txt<input id="text-upload" type="file" accept=".txt,text/plain"></label></div><p class="muted">Reading text replaces the medication draft below. Your published plan stays intact until you publish.</p></section><form id="plan-form"><section class="card"><h2>2. Review the care plan</h2><div class="grid three">${field("Patient name", "patient", draft.patient, "text", "required")}${field("Plan start date", "startDate", draft.startDate, "date", "required")}${select("Patient’s time zone", "timeZone", draft.timeZone, [...new Set([draft.timeZone, ...Intl.supportedValuesOf("timeZone")])])}</div>${draft.unresolved?.length ? `<section class="notice"><h3>Instructions requiring review</h3>${draft.unresolved.map((u, i) => `<label class="check"><input name="resolve-${i}" type="checkbox" ${u.resolved ? "checked" : ""}><span>${esc(u.reason)} ${u.text ? `<q>${esc(u.text)}</q>` : ""}<small>I entered this manually, or verified it is outside the supported plan.</small></span></label>`).join("")}</section>` : ""}<datalist id="med-names">${draft.meds.map((m) => `<option value="${esc(m.drug)}">`).join("")}</datalist>${draft.meds.map(medEditor).join("")}${button("add-med", "+ Add medication", "secondary")}<details><summary>Meal and routine times</summary><p class="muted">These define what the scheduler means by food, morning, and bedtime. Unsupported or conflicting rules prevent publication. “Twice daily” uses two daytime slots at least four hours apart; an exact interval must be entered as “every 12 hours.”</p><div class="grid three">${Object.keys(
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
      )}</div></details><h3>Follow-ups</h3><p class="muted">A deadline creates a task to book a visit. A confirmed appointment uses the date and time you enter.</p>${draft.followups
      .map(
        (f, i) =>
          `<fieldset><legend>Follow-up ${i + 1}</legend><div class="grid three">${field("Provider", `provider-${i}`, f.provider)}${field("Due within (days)", `days-${i}`, f.days, "number", 'min="0" max="365"')}${select(
            "Appointment status",
            `confirmed-${i}`,
            String(f.confirmed),
            [
              ["false", "Needs booking"],
              ["true", "Already booked"],
            ],
          )}${field("Confirmed date", `fdate-${i}`, f.date, "date")}${field("Confirmed time", `ftime-${i}`, f.time, "time")}</div>${button("remove-followup", "Remove follow-up", "text danger", `data-index="${i}"`)}</fieldset>`,
      )
      .join(
        "",
      )}${button("add-followup", "+ Add follow-up", "secondary")}<h3>Daily monitoring</h3><label class="check"><input name="weight" type="checkbox" ${draft.monitoring?.weight ? "checked" : ""}>Record daily weight</label><label class="check"><input name="symptoms" type="checkbox" ${draft.monitoring?.symptoms ? "checked" : ""}>Record daily symptoms</label><label>Clinician’s warning / escalation instructions (one per line)<textarea name="flags" rows="4">${esc(draft.flags.join("\n"))}</textarea></label></section><section class="card"><h2>3. Check and publish</h2><p class="muted">The scheduler checks the supported timing rules you entered. It does not identify interactions or decide whether a medication regimen is appropriate.</p><div class="actions">${button("preview", "Check schedule", "secondary")}<button class="primary" type="submit">Publish 30-day plan</button></div><div id="preview" aria-live="polite">${previewHTML()}</div></section></form>`
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
function scheduleView() {
  if (!state.plan)
    return (
      heading("Daily schedule", "Start with a reviewed care plan.") +
      emptyView()
    );
  const p = state.plan;
  return (
    heading(
      "A rhythm for each day.",
      `Plan revision ${state.revision} · ${esc(p.timeZone)}`,
      button("calendar", "Export calendar", "secondary"),
    ) +
    `<section class="card"><h2>Medication schedule</h2><p class="muted">${esc(p.startDate)} · 30 days. Individual start and stop dates apply.</p>${p.meds.map((m) => `<article class="schedule-row"><div><h3>${esc(m.drug)}</h3><p>${esc(m.dose)} · ${esc(m.freq)}</p><small>${m.meal === "any" ? "No food rule entered" : esc(m.meal) + " " + esc(m.mealTarget && m.mealTarget !== "any" ? m.mealTarget : "food")}${m.gapTarget ? " · ≥ " + esc(m.gapHours) + "h from " + esc(m.gapTarget) : ""}</small><blockquote>${esc(m.source || "Manually entered and reviewed")}</blockquote></div><div class="time-pills">${p.compiled.times[m.id].map((t) => `<span>${t}</span>`).join("")}</div></article>`).join("")}</section><section class="card"><h2>Your routine anchors</h2><div class="anchor-list">${Object.entries(
      p.prefs,
    )
      .map(([k, v]) => `<span>${esc(k)} <b>${v}</b></span>`)
      .join("")}</div></section>`
  );
}
function teamView() {
  return (
    heading(
      "Care is a team effort.",
      "Names help record who did what on this tablet. They do not verify identity.",
    ) +
    `<section class="card"><form id="caregiver-form"><h2>Add a caregiver</h2>${field("Caregiver name", "name", "", "text", 'required maxlength="100"')}<button type="submit" class="primary">Add caregiver</button></form></section><div class="team-grid">${state.team
      .filter((m) => !m.archived)
      .map((m) => {
        const tasks = state.tasks.filter((t) => !t.archived && t.who === m.id),
          done = tasks.filter((t) => t.status === "done").length;
        return `<section class="card person"><span class="avatar large">${esc(m.name[0])}</span><h2>${esc(m.name)}</h2><p class="muted">Local caregiver label</p><div class="person-stats"><div><strong>${tasks.length}</strong><small>Assigned</small></div><div><strong>${done}</strong><small>Completed</small></div></div>${m.id !== "patient" ? button("rename-caregiver", "Rename", "secondary", `data-id="${esc(m.id)}"`) + button("remove-caregiver", "Remove", "text danger", `data-id="${esc(m.id)}"`) : ""}</section>`;
      })
      .join(
        "",
      )}</div><p class="muted">${state.tasks.filter((t) => !t.archived && !t.who).length} tasks are unassigned. Assign them from Today or Records. Removing a name keeps past records.</p>`
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
    heading(
      "The care record.",
      "Review other dates or correct an entry. Today always shows the patient’s current day.",
    ) +
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
function settingsView() {
  return (
    heading(
      "Your data, on this device.",
      "Local care records, optional exports, and reminders.",
    ) +
    `<section class="card"><h2>Local storage</h2><p>The plan and care history are saved in this browser’s database on this device. They are not sent to the app server. There are no accounts or remote family access.</p><p class="muted">Anyone who can open this browser can read or change the record. Use the tablet’s screen lock. Clearing browser data can delete the record. Backups and calendar exports create separate copies.</p></section><section class="card"><h2>Reminders</h2><p>Page reminders require permission and an open, awake page. They cannot guarantee alarms when the tablet is locked or the browser is closed.</p>${button("reminders", "Enable reminders while this page is open", "secondary")}<h3>Optional calendar export</h3><p class="muted">The file contains care details and a 15-minute reminder. Importing it into a cloud calendar can send those details outside this device. This is a snapshot; later plan edits do not update imported events.</p>${button("calendar", "Download calendar (.ics)", "secondary")}</section><section class="card"><h2>Backup and restore</h2><p>A backup is a plain-text file containing the patient’s care record and activity history. Keep it private. Nothing is uploaded when you download or restore a backup here.</p><div class="actions">${button("backup", "Download backup", "secondary")}<label class="file-label">Restore bedside backup<input type="file" id="backup-upload" accept=".json,application/json"></label></div><p class="muted">Restoring replaces the bedside record in this browser. The older server version’s backups are a different format and cannot be restored here yet.</p><hr><h3>Delete this device’s care data</h3><p>Removes setup, caregivers, plan, records, and activity from this browser’s active record. Exported files and the old server database are separate copies.</p>${button("reset", "Delete care data", "danger-button")}</section><section class="card"><h2>Supported scope</h2><p>English text entry; fixed daily frequencies; food timing windows; named medication spacing rules; 30-day plans. Unsupported instructions require review. Translation and photo reading are not included.</p><p>Offline installation and additional backup protections are planned for later stages. No clinical validation has been performed; use fictional data while testing.</p></section>`
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
function editTask(id) {
  const t = state.tasks.find((t) => t.id === id);
  const dialog = document.createElement("dialog");
  dialog.id = "task-dialog";
  dialog.dataset.version = state.version;
  const status = t.status === "todo" ? "done" : t.status;
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
  dialog.innerHTML = `<form id="task-form"><span class="eyebrow">RECORD WHAT HAPPENED</span><h2 id="record-title">${esc(t.label)}</h2><p id="record-schedule">Scheduled ${esc(fmt(t.dueAt))} · ${esc(state.plan?.timeZone)}</p>${t.date !== localDate() ? '<p class="notice">This task is from a different day. Enter when it actually happened.</p>' : ""}${t.source ? `<details class="task-source"><summary>Original instruction</summary><p>${esc(t.source)}</p></details>` : ""}<input name="id" type="hidden" value="${esc(id)}"><fieldset class="record-choice"><legend>What happened?</legend>${[
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
    )}</fieldset><div class="record-fields">${select("Recorded by", "recordedBy", t.recordedBy || "", [["", "Choose who is recording"], ...people])}${field("Actual completion / skip time (your device’s time zone)", "actualAt", actual, "datetime-local")}<p class="muted">Use the time it happened, even if you are recording it later.</p></div><div class="measurement-fields">${t.kind === "weight" ? field("Recorded weight", "value", t.value?.amount || "", "number", 'min="0.01" step="0.01"') + select("Unit", "unit", t.value?.unit || "kg", ["kg", "lb"]) : t.kind === "symptoms" ? `<label>Symptoms (write “none” if none)<textarea name="value">${esc(t.value || "")}</textarea></label>` : ""}</div><details class="assignment-details" ${t.note ? "open" : ""}><summary>Assignment and notes</summary>${select("Assigned caregiver", "who", t.who, [["", "Unassigned"], ...people])}<label>Note / reason for correction<textarea name="note">${esc(t.note)}</textarea></label></details><p id="task-error" class="alert" role="alert" tabindex="-1" hidden></p><div class="actions record-actions"><button type="submit" class="primary bedside-button">Save completed record</button>${button("close-dialog", "Cancel", "secondary")}</div></form>`;
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
    if (action === "backup") {
      if (
        !confirm(
          "Download a plain-text backup containing this patient’s care data? Store it privately.",
        )
      )
        return;
      download(
        "careloop-bedside-backup.json",
        JSON.stringify(makeBackup(state), null, 2),
        "application/json",
      );
    }
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
              body: `${t.time} · ${t.label}`,
            });
            notified.add(t.id);
          }
        }
      }, 15000);
      toast("Page reminders enabled while this page stays open and awake.");
    }
    if (action === "reset") {
      if (
        prompt(
          "This deletes setup and all care records in this browser. Type DELETE to continue.",
        ) !== "DELETE"
      )
        return;
      await commit({ type: "reset", confirm: "DELETE" });
      clearInterval(reminderTimer);
      tab = "today";
      filter = "";
      recordQuery = "";
      draft = null;
      preview = null;
      await refresh();
      toast("This browser’s care record was deleted.");
    }
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
      toast("Bedside setup saved on this device.");
    }
    if (e.target.getAttribute("id") === "caregiver-form") {
      await commit({
        type: "caregiver",
        name: new FormData(e.target).get("name"),
      });
      await refresh();
      toast("Caregiver name saved on this device.");
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
      toast("Care plan published. Existing completed records were preserved.");
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
      toast("Care record saved on this device.");
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
      if (!file) return;
      if (file.size > 5000000) throw new Error("Backup must be under 5 MB.");
      const backup = JSON.parse(await file.text());
      if (
        !confirm(
          "Replace all bedside setup and care records in this browser with this backup?",
        )
      )
        return;
      await commit({ type: "restore", backup });
      draft = null;
      preview = null;
      await refresh();
      toast("Backup restored.");
    }
  } catch (err) {
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
