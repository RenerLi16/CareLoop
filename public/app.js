import {
  FREQUENCIES,
  DEFAULT_PREFS,
  parseDischarge,
  compilePlan,
  logWarnings,
  minutes,
} from "/domain.js";
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
  authMode = "login",
  filter = "",
  busy = false,
  reminderTimer = null,
  renderedTab = null;
const app = $("#app");
const invite = new URLSearchParams(location.search).get("invite");
if (invite) authMode = "register";
const localDate = () =>
  new Date().toLocaleDateString("en-CA", {
    timeZone:
      state?.plan?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
const localInput = (iso = new Date().toISOString()) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const fmt = (iso) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: state?.plan?.timeZone,
  }).format(new Date(iso));
const canEdit = () => state?.role !== "viewer";
function toast(message, error = false) {
  $("#toast").textContent = message;
  $("#toast").className = error ? "show error" : "show";
  setTimeout(() => ($("#toast").className = ""), 6500);
}
async function api(url, data) {
  const res = await fetch(url, {
    method: data ? "POST" : "GET",
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  const value = await res.json();
  if (!res.ok)
    throw Object.assign(new Error(value.error || "Request failed"), {
      status: res.status,
    });
  return value;
}
async function refresh(render = true) {
  state = await api("/api/state");
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
function auth() {
  app.innerHTML = `<main class="auth"><a class="brand" href="/">✳ <span>CareLoop</span></a><div class="eyebrow">CARE, TOGETHER</div><h1>A little more clarity.<br>A little less worry.</h1><p class="lead">Turn discharge instructions into a shared routine for the days ahead.</p><section class="card"><h2>${authMode === "login" ? "Welcome back" : invite ? "Join your family’s care team" : "Start your care team"}</h2><form id="auth-form">${authMode === "register" ? field("Your name", "name", "") + (!invite ? field("Care team name", "familyName", "") : "") : ""}${field("Email", "email", "", "email", 'required autocomplete="email"')}${field("Password", "password", "", "password", 'required minlength="12" maxlength="256" autocomplete="' + (authMode === "login" ? "current-password" : "new-password") + '"')}<p class="muted">Use at least 12 characters. Your email is used for sign-in; no email is sent.</p><button class="primary" type="submit">${authMode === "login" ? "Sign in" : "Create account"}</button></form><button class="text" data-action="auth-switch">${authMode === "login" ? "New here? Create a care team" : "Already have an account? Sign in"}</button>${invite ? '<p class="notice">This invitation works for a new account. Sign in with an existing account only if it already belongs to this team.</p>' : ""}</section><p class="muted">A care coordination tool. Review every instruction against the original discharge paperwork.</p></main>`;
}
function draw() {
  if (!state) {
    auth();
    return;
  }
  app.innerHTML = `<div class="shell"><aside><a class="brand" href="/">✳ <span>CareLoop</span></a><div class="team-label">${esc(state.familyName)}</div><nav aria-label="Main navigation">${[
    ["today", "◷", "Today"],
    ["plan", "▤", "Care plan"],
    ["schedule", "◴", "Daily schedule"],
    ["team", "♧", "Care team"],
    ["records", "☷", "Records"],
    ["settings", "⚙", "Settings"],
  ]
    .map(
      ([key, icon, label]) =>
        `<button data-tab="${key}" class="nav-item ${key === tab ? "active" : ""}" ${key === tab ? 'aria-current="page"' : ""}><span aria-hidden="true">${icon}</span>${label}</button>`,
    )
    .join(
      "",
    )}</nav><div class="aside-bottom"><span class="avatar">${esc(state.user.name.slice(0, 1))}</span><div><b>${esc(state.user.name)}</b><small>${esc(state.role)}</small></div>${button("logout", "Sign out", "text")}</div></aside><main class="main"><header><span class="eyebrow">THE NEXT 30 DAYS, TOGETHER</span><span class="sync">● Shared record · updates every 5 seconds</span></header><div id="content">${{ today: today, plan: planView, schedule: scheduleView, team: teamView, records: recordsView, settings: settingsView }[tab]()}</div><footer>CareLoop organizes the instructions you enter. It does not diagnose, recommend treatment, or check all possible medication interactions.</footer></main></div>`;
  if (renderedTab !== tab) {
    window.scrollTo(0, 0);
    renderedTab = tab;
  }
}
function emptyView() {
  return `<section class="empty card"><span class="big-icon">✳</span><h2>One plan. Everyone on the same page.</h2><p>Start with the discharge paperwork. Review each instruction, build a schedule, and share the tasks.</p>${canEdit() ? button("new-plan", "Create a care plan") : "<p>Ask your team owner to create the care plan.</p>"}</section>`;
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
function today() {
  const date = filter || localDate(),
    tasks = state.tasks.filter((t) => !t.archived && t.date === date),
    done = tasks.filter((t) => t.status === "done").length,
    overdue = state.tasks.filter(
      (t) =>
        !t.archived &&
        t.status === "todo" &&
        Date.parse(t.dueAt) < Date.now() - 3600000,
    ).length,
    next = state.tasks.find(
      (t) =>
        !t.archived && t.status === "todo" && Date.parse(t.dueAt) >= Date.now(),
    );
  return (
    heading(
      "A clearer day ahead.",
      state.plan
        ? `Care for ${esc(state.plan.patient)} · ${esc(state.plan.timeZone)}`
        : "Your family’s care starts here.",
      state.plan
        ? '<a class="button secondary" href="/api/calendar">Export calendar</a>'
        : "",
    ) +
    (!state.plan
      ? emptyView()
      : `<div class="stats"><section class="card"><span>Today’s progress</span><strong>${state.tasks.filter((t) => !t.archived && t.date === localDate() && t.status === "done").length}<small> / ${state.tasks.filter((t) => !t.archived && t.date === localDate()).length}</small></strong></section><section class="card"><span>Past due · all days</span><strong>${overdue}</strong><small>More than 1 hour overdue</small></section><section class="card"><span>Next on the plan</span><strong class="next-time">${next ? esc(next.time) : "All clear"}</strong><small>${next ? esc(next.label) + " · " + esc(next.date) : "No upcoming tasks"}</small></section></div>${warningsView()}<section class="card"><div class="section-title"><div><h2>The daily routine</h2><p class="muted">${done} of ${tasks.length} recorded for this day</p></div><label>View day<input id="day-filter" type="date" value="${esc(date)}"></label></div>${tasks.length ? tasks.map(taskRow).join("") : '<p class="empty-line">No tasks for this date. Choose a date within the plan.</p>'}</section>${state.plan.flags?.length ? `<section class="card flags"><h2>Keep these instructions close</h2><p class="muted">Copied from your plan. Check the original paperwork for full instructions.</p>${state.plan.flags.map((f) => `<p>${esc(f)}</p>`).join("")}</section>` : ""}`)
  );
}
function taskRow(t) {
  const person = state.team.find((x) => x.id === t.who),
    late = t.status === "todo" && Date.parse(t.dueAt) < Date.now() - 3600000;
  return `<article class="task ${t.status === "done" ? "completed" : ""}"><div class="time">${esc(t.time)}<small>${esc(t.kind)}</small></div><div class="task-detail"><b>${esc(t.label)}</b><small>${esc(person?.name || "Unassigned")}${t.actualAt ? " · Recorded " + esc(fmt(t.actualAt)) : ""}</small>${t.value ? `<p>${esc(typeof t.value === "object" ? t.value.amount + " " + t.value.unit : t.value)}</p>` : ""}${t.note ? `<p class="muted">${esc(t.note)}</p>` : ""}</div><span class="badge ${late ? "late" : ""}">${late ? "Past due" : esc(t.status)}</span>${canEdit() ? button("edit-task", t.status === "todo" ? "Record / assign" : "Edit record", "secondary", `data-id="${esc(t.id)}"`) : ""}</article>`;
}
function newDraft() {
  return {
    patient: "",
    startDate: localDate(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    prefs: { ...DEFAULT_PREFS },
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
  if (!canEdit())
    return (
      heading("Care plan", "Your access is view only.") +
      (state.plan
        ? `<section class="card"><h2>${esc(state.plan.patient)}</h2><p>Starts ${esc(state.plan.startDate)} · ${esc(state.plan.timeZone)}</p>${state.plan.meds.map((m) => `<p><b>${esc(m.drug)} ${esc(m.dose)}</b> · ${esc(m.freq)}<br>${esc(m.source)}</p>`).join("")}</section>`
        : emptyView())
    );
  draft ??= state.plan ? structuredClone(state.plan) : newDraft();
  return (
    heading(
      "From paperwork to a plan.",
      "Review every detail before publishing. Completed care records stay in the history.",
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
      '<a class="button secondary" href="/api/calendar">Export calendar</a>',
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
      "See who is helping, and make the work visible.",
      state.role === "owner" ? button("invite", "Invite a caregiver") : "",
    ) +
    `<div id="invite-result"></div><div class="team-grid">${state.team
      .map((m) => {
        const tasks = state.tasks.filter((t) => !t.archived && t.who === m.id),
          done = tasks.filter((t) => t.status === "done").length;
        return `<section class="card person"><span class="avatar large">${esc(m.name[0])}</span><h2>${esc(m.name)}</h2><p class="muted">${esc(m.role)} · ${esc(m.email)}</p><div class="person-stats"><div><strong>${tasks.length}</strong><small>Assigned</small></div><div><strong>${done}</strong><small>Completed</small></div><div><strong>${new Set(tasks.filter((t) => t.status === "done").map((t) => t.date)).size}</strong><small>Days helped</small></div></div>${state.role === "owner" && m.id !== state.user.id ? `${button("change-role", m.role === "viewer" ? "Allow editing" : "Make view only", "secondary", `data-id="${m.id}" data-role="${m.role === "viewer" ? "editor" : "viewer"}"`)} ${button("remove-member", "Remove access", "text danger", `data-id="${m.id}"`)}` : ""}</section>`;
      })
      .join(
        "",
      )}</div><p class="muted">${state.tasks.filter((t) => !t.archived && !t.who).length} tasks are unassigned. Assign them from Today or Records.</p>`
  );
}
function recordsView() {
  const tasks = state.tasks.filter((t) => !t.archived || t.status !== "todo");
  return (
    heading(
      "The care record.",
      "Completed tasks survive plan changes. Corrections are recorded in the activity log.",
    ) +
    warningsView() +
    `<section class="card"><label>Search records<input id="record-search" placeholder="Medication, date, or task"></label><div id="record-list">${
      tasks.length
        ? tasks
            .slice(0, 100)
            .map(
              (t) =>
                `<div class="record-date">${esc(t.date)}</div>${taskRow(t)}`,
            )
            .join("")
        : "<p>No records yet.</p>"
    }</div><p class="muted">Showing up to 100 matching tasks. Use search to find a date or medication.</p></section><section class="card"><h2>Recent activity</h2>${state.audit.map((a) => `<p>${esc(a.action)}<small>${esc(a.name || "Former team member")} · ${esc(fmt(a.at))}</small>${a.details ? `<small>Change: ${esc(JSON.parse(a.details).before.status)} → ${esc(JSON.parse(a.details).after.status)} · actual time ${esc(JSON.parse(a.details).before.actualAt || "not recorded")} → ${esc(JSON.parse(a.details).after.actualAt || "not recorded")}</small>` : ""}</p>`).join("")}</section>`
  );
}
function settingsView() {
  return (
    heading(
      "Your data, your choices.",
      "Tools for reminders, backups, and managing the care record.",
    ) +
    `<section class="card"><h2>Account security</h2><form id="password-form">${field("Current password", "currentPassword", "", "password", 'required autocomplete="current-password"')}${field("New password", "newPassword", "", "password", 'required minlength="12" maxlength="256" autocomplete="new-password"')}<button type="submit" class="secondary">Change password</button></form><p class="muted">Changing your password signs out your other devices.</p></section><section class="card"><h2>Reminders</h2><p>Export pending tasks to Apple Calendar, Google Calendar, or another calendar app. The file includes a reminder 15 minutes before each task. Check your calendar’s notification settings after importing.</p><a class="button primary" href="/api/calendar">Download calendar (.ics)</a><p class="muted">This is a snapshot. Plan edits do not update imported events. Remove the old imported calendar before importing a replacement to avoid stale or duplicate reminders.</p>${button("reminders", "Enable reminders while this page is open", "secondary")}<p class="muted">Page reminders require browser permission and an open, awake page. They are an extra aid; use your calendar for background reminders.</p></section><section class="card"><h2>Backup and privacy</h2><p>The server stores your team’s record. Signed-in team members can access it according to their role. No external AI or analytics services receive the discharge text.</p><p class="muted">Backups contain sensitive information in plain text. Keep them somewhere private. The server database also needs encrypted disks and HTTPS when hosted.</p>${state.role === "owner" ? `<div class="actions"><a class="button secondary" href="/api/backup">Download backup</a><label class="file-label">Restore backup<input type="file" id="backup-upload" accept=".json,application/json"></label></div><p class="muted">Restoring replaces this team’s care plan and history. Team accounts and access stay as they are.</p><hr><h3>Delete care data</h3><p>Deletes the plan, tasks, and previous activity from the active database. Download a backup first if needed. Team accounts remain. Server backups and calendar copies must be deleted separately.</p>${button("reset", "Delete care data", "danger-button")}` : "<p>Only the team owner can export, restore, or delete the care record.</p>"}</section><section class="card"><h2>Supported scope</h2><p>English text entry; fixed daily frequencies; food timing windows; named medication spacing rules; 30-day plans. Tapers, as-needed dosing, changing dose amounts, and other unsupported instructions require separate review. Automatic translation and photo reading are not included.</p><p>No clinical validation has been performed. Test with fictional data until the workflow and scheduling rules have been reviewed.</p></section>`
  );
}
function editTask(id) {
  const t = state.tasks.find((t) => t.id === id);
  const dialog = document.createElement("dialog");
  dialog.id = "task-dialog";
  dialog.innerHTML = `<form id="task-form"><h2>${esc(t.label)}</h2><p>${esc(t.date)} at ${esc(t.time)} · ${esc(state.plan?.timeZone)}</p><input name="id" type="hidden" value="${esc(id)}">${select("Assigned caregiver", "who", t.who, [["", "Unassigned"], ...state.team.filter((m) => m.role !== "viewer").map((m) => [m.id, m.name])])}${select(
    "Status",
    "status",
    t.status,
    [
      ["todo", "Pending"],
      ["done", "Completed"],
      ["skipped", "Skipped"],
    ],
  )}${field("Actual completion / skip time (your device’s time zone)", "actualAt", localInput(t.actualAt || undefined), "datetime-local")}<p class="muted">For a past task, enter when it actually happened. This can differ from when you record it.</p>${t.kind === "weight" ? field("Recorded weight", "value", t.value?.amount || "", "number", 'min="0.01" step="0.01"') + select("Unit", "unit", t.value?.unit || "kg", ["kg", "lb"]) : t.kind === "symptoms" ? `<label>Symptoms (write “none” if none)<textarea name="value">${esc(t.value || "")}</textarea></label>` : ""}<label>Note / reason for correction<textarea name="note">${esc(t.note)}</textarea></label><div class="actions"><button type="submit" class="primary">Save record</button>${button("close-dialog", "Cancel", "secondary")}</div></form>`;
  document.body.append(dialog);
  dialog.showModal();
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
  if (e.target.closest('[data-action="close-dialog"]'))
    $("#task-dialog")?.close();
});
async function action(action, b) {
  if (busy) return;
  try {
    if (action === "auth-switch") {
      authMode = authMode === "login" ? "register" : "login";
      auth();
    }
    if (action === "logout") {
      await api("/api/logout", {});
      state = null;
      draft = null;
      filter = "";
      clearInterval(reminderTimer);
      draw();
    }
    if (action === "new-plan") {
      draft = newDraft();
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
    if (action === "invite") {
      const role = confirm(
        "Allow this person to edit the care record? Choose Cancel to create view-only access.",
      )
        ? "editor"
        : "viewer";
      const { token } = await api("/api/invite", { role });
      $("#invite-result").innerHTML =
        `<section class="success"><h3>Invitation ready · ${role === "editor" ? "Can edit" : "View only"}</h3><p>Share this link privately. It expires after 48 hours and works once, for a new account.</p><label>Invitation link<input readonly value="${esc(location.origin + "/?invite=" + token)}"></label></section>`;
    }
    if (action === "change-role" || action === "remove-member") {
      if (
        action === "remove-member" &&
        !confirm(
          "Remove this person’s access? Their assigned tasks will become unassigned.",
        )
      )
        return;
      await api("/api/member", {
        userId: b.dataset.id,
        role: action === "remove-member" ? "remove" : b.dataset.role,
      });
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
        for (const t of state.tasks.filter(
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
          "This deletes the team’s care plan and records. Type DELETE to continue.",
        ) !== "DELETE"
      )
        return;
      await api("/api/reset", { version: state.version, confirm: "DELETE" });
      draft = null;
      preview = null;
      await refresh();
      toast("Care plan and records deleted.");
    }
  } catch (e) {
    toast(e.message, true);
  }
}
document.addEventListener("submit", async (e) => {
  if (
    !["auth-form", "plan-form", "task-form", "password-form"].includes(
      e.target.getAttribute("id"),
    )
  )
    return;
  e.preventDefault();
  if (busy) return;
  busy = true;
  const submit = e.target.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    if (e.target.getAttribute("id") === "password-form") {
      await api("/api/password", Object.fromEntries(new FormData(e.target)));
      e.target.reset();
      toast("Password changed. Your other devices have been signed out.");
    }
    if (e.target.getAttribute("id") === "auth-form") {
      const data = Object.fromEntries(new FormData(e.target));
      if (invite) data.invite = invite;
      await api("/api/" + authMode, data);
      history.replaceState({}, "", "/");
      await refresh();
    }
    if (e.target.getAttribute("id") === "plan-form") {
      collectDraft();
      preview = compilePlan(draft);
      if (!preview.ok) {
        draw();
        $("#preview").scrollIntoView();
        return;
      }
      await api("/api/plan", { plan: draft, version: state.version });
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
      await api("/api/task", { ...data, version: state.version });
      $("#task-dialog").close();
      await refresh();
      toast("Care record saved.");
    }
  } catch (err) {
    toast(err.message, true);
    if (err.status === 409) {
      if (e.target.getAttribute("id") === "task-form") {
        $("#task-dialog")?.close();
        await refresh();
        toast(
          "Another caregiver changed the record. The latest version is loaded. Open the task again to review it before editing.",
          true,
        );
      } else {
        await refresh(false);
        toast(
          err.message +
            " Your plan draft is still here. Compare it with the published schedule before retrying.",
          true,
        );
      }
    }
  } finally {
    busy = false;
    if (submit?.isConnected) submit.disabled = false;
  }
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
      if (file.size > 2000000) throw new Error("Backup must be under 2 MB.");
      const backup = JSON.parse(await file.text());
      if (
        !confirm("Replace this team’s plan and care records with this backup?")
      )
        return;
      await api("/api/restore", { backup, version: state.version });
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
    const q = e.target.value.toLowerCase(),
      tasks = state.tasks
        .filter(
          (t) =>
            (!t.archived || t.status !== "todo") &&
            (t.label + " " + t.date + " " + t.status).toLowerCase().includes(q),
        )
        .slice(0, 100);
    $("#record-list").innerHTML =
      tasks
        .map(
          (t) => `<div class="record-date">${esc(t.date)}</div>${taskRow(t)}`,
        )
        .join("") || "<p>No matching records.</p>";
  }
  if (e.target.closest("[data-med]")) {
    const row = e.target.closest("[data-med]");
    if (e.target.type !== "checkbox")
      row.querySelector('[name^="reviewed-"]').checked = false;
  }
});
try {
  await refresh();
} catch (e) {
  if (e.status !== 401) toast(e.message, true);
  auth();
}
setInterval(async () => {
  if (!state || busy || document.querySelector("dialog[open]")) return;
  try {
    const fresh = await api("/api/state");
    if (fresh.version !== state.version) {
      if (tab === "plan") {
        toast(
          "The shared record changed. Your draft is preserved; review it before publishing.",
        );
        return;
      }
      state = fresh;
      if (
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName,
        )
      )
        draw();
    }
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
      state = null;
      draw();
      toast(e.message, true);
    }
  }
}, 5000);
