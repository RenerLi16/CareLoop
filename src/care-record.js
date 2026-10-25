import {
  DEFAULT_PREFS,
  compilePlan,
  generateTasks,
  mergeTasks,
  reconcilePlan,
  minutes,
  validDate,
} from "./domain.js";

export const BACKUP_FORMAT = "careloop-bedside-1";
export const emptyRecord = () => ({
  schemaVersion: 1,
  version: 0,
  revision: 0,
  profile: null,
  plan: null,
  tasks: [],
  team: [],
  audit: [],
});
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const text = (value, label, max = 100) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    fail(`Enter ${label} (up to ${max} characters).`);
  return value.trim();
};
function checkProfile(profile) {
  const clean = {
    patient: text(profile?.patient, "a patient name or nickname"),
    startDate: profile?.startDate,
    timeZone: profile?.timeZone,
    prefs: { ...DEFAULT_PREFS, ...profile?.prefs },
  };
  if (!validDate(clean.startDate)) fail("Enter a valid plan start date.");
  if (typeof clean.timeZone !== "string") fail("Choose a time zone.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: clean.timeZone }).format();
  } catch {
    fail("Choose a valid time zone.");
  }
  for (const key of Object.keys(DEFAULT_PREFS))
    if (!Number.isFinite(minutes(clean.prefs[key])))
      fail(`Check the ${key} time.`);
  return clean;
}
function checkPlan(plan) {
  if (
    !plan ||
    !Array.isArray(plan.meds) ||
    !Array.isArray(plan.followups) ||
    !Array.isArray(plan.flags) ||
    plan.followups.length > 50 ||
    plan.flags.length > 100 ||
    typeof plan.patient !== "string" ||
    typeof plan.startDate !== "string" ||
    typeof plan.timeZone !== "string" ||
    !plan.prefs ||
    plan.meds.some(
      (m) =>
        !m ||
        ["id", "drug", "dose", "freq", "meal"].some(
          (k) => typeof m[k] !== "string",
        ) ||
        (m.gapTarget != null && typeof m.gapTarget !== "string"),
    ) ||
    plan.followups.some(
      (f) => !f || typeof f.id !== "string" || typeof f.provider !== "string",
    ) ||
    plan.flags.some((f) => typeof f !== "string") ||
    (plan.unresolved != null &&
      (!Array.isArray(plan.unresolved) ||
        plan.unresolved.some((u) => !u || typeof u !== "object")))
  )
    fail("Invalid care plan fields.");
  if (JSON.stringify(plan).length > 200000) fail("The care plan is too large.");
}
function compileChecked(plan) {
  checkPlan(plan);
  const compiled = compilePlan(plan);
  if (!compiled.ok) fail(compiled.errors.join("\n"), 422);
  try {
    return {
      plan: { ...structuredClone(plan), compiled },
      tasks: generateTasks(plan, compiled),
    };
  } catch (error) {
    fail(error.message, 422);
  }
}
function member(state, id) {
  return state.team.find((m) => m.id === id && !m.archived);
}
function patchTask(state, task, patch, now) {
  if (patch.who !== undefined) {
    if (patch.who && !member(state, patch.who))
      fail("Choose a current caregiver.");
    task.who = patch.who;
  }
  if (patch.status !== undefined) {
    if (!["todo", "done", "skipped"].includes(patch.status))
      fail("Invalid task status.");
    task.status = patch.status;
    if (patch.status === "todo") {
      task.actualAt = null;
      task.value = null;
      task.recordedBy = "";
      task.recordedByName = "";
    } else {
      if (
        typeof patch.actualAt !== "string" ||
        !Number.isFinite(Date.parse(patch.actualAt)) ||
        Date.parse(patch.actualAt) > Date.parse(now) + 60000
      )
        fail("Enter when this happened, no later than now.");
      const person = member(state, patch.recordedBy);
      if (!person) fail("Choose who is recording this task.");
      if (patch.status === "skipped") task.value = null;
      task.actualAt = new Date(patch.actualAt).toISOString();
      task.recordedBy = person.id;
      task.recordedByName = person.name;
    }
  }
  if (patch.note !== undefined) task.note = String(patch.note).slice(0, 2000);
  if (task.status === "done" && task.kind === "weight") {
    const amount = Number(patch.value ?? task.value?.amount),
      unit = patch.unit ?? task.value?.unit;
    if (!Number.isFinite(amount) || amount <= 0 || !["kg", "lb"].includes(unit))
      fail("Record a positive weight and its unit.");
    task.value = { amount, unit };
  }
  if (task.status === "done" && task.kind === "symptoms")
    task.value = text(patch.value ?? task.value, "symptoms, or “none”", 2000);
}
function validateBackup(backup) {
  if (
    !backup ||
    backup.format !== BACKUP_FORMAT ||
    !backup.record ||
    backup.record.schemaVersion !== 1 ||
    !Array.isArray(backup.record.tasks) ||
    backup.record.tasks.length > 10000 ||
    !Array.isArray(backup.record.team) ||
    backup.record.team.length > 100 ||
    !Array.isArray(backup.record.audit)
  )
    fail("This is not a supported bedside backup.");
  if (JSON.stringify(backup).length > 5000000)
    fail("Backup must be under 5 MB.");
  const saved = structuredClone(backup.record);
  saved.profile = checkProfile(saved.profile);
  if (saved.plan) saved.plan = compileChecked(saved.plan).plan;
  const ids = new Set();
  for (const person of saved.team) {
    if (
      !person ||
      typeof person.id !== "string" ||
      !person.id ||
      ids.has(person.id)
    )
      fail("Backup contains invalid caregivers.");
    ids.add(person.id);
    person.name = text(person.name, "a caregiver name");
    person.archived = Boolean(person.archived);
  }
  if (!saved.team.some((p) => p.id === "patient" && !p.archived))
    fail("Backup must include the Patient / self entry.");
  ids.clear();
  for (const task of saved.tasks) {
    if (
      !task ||
      typeof task.id !== "string" ||
      ids.has(task.id) ||
      !validDate(task.date) ||
      !Number.isFinite(minutes(task.time)) ||
      typeof task.dueAt !== "string" ||
      !Number.isFinite(Date.parse(task.dueAt)) ||
      !["med", "visit", "weight", "symptoms"].includes(task.kind) ||
      !["todo", "done", "skipped"].includes(task.status) ||
      typeof task.label !== "string" ||
      (task.actualAt != null && !Number.isFinite(Date.parse(task.actualAt)))
    )
      fail("Backup contains an invalid task.");
    if (task.status !== "todo" && !task.actualAt)
      fail("A completed or skipped task is missing its actual time.");
    ids.add(task.id);
    if (task.who && !member(saved, task.who)) task.who = "";
  }
  if (
    !saved.audit.every(
      (a) =>
        a &&
        typeof a.action === "string" &&
        typeof a.name === "string" &&
        Number.isFinite(Date.parse(a.at)) &&
        (!a.details ||
          (typeof a.details === "string" &&
            (() => {
              try {
                const d = JSON.parse(a.details);
                return d.before && d.after;
              } catch {
                return false;
              }
            })())),
    )
  )
    fail("Backup contains invalid activity history.");
  return saved;
}
export function makeBackup(record, now = new Date().toISOString()) {
  return {
    format: BACKUP_FORMAT,
    exportedAt: now,
    record: structuredClone(record),
  };
}

// The storage adapter runs this reducer inside one IndexedDB read/write transaction.
// No state is returned to the UI until that transaction has committed.
export function changeRecord(
  current,
  command,
  expectedVersion,
  now = new Date().toISOString(),
) {
  if (current.schemaVersion !== 1)
    fail(
      "This record was created by a different app version. Export it before updating.",
      422,
    );
  if (current.version !== expectedVersion)
    fail(
      "This record changed in another tab. Review the latest version before retrying.",
      409,
    );
  let state = structuredClone(current),
    action,
    name = "On this device",
    details = null;
  if (command.type === "setup") {
    if (state.profile) fail("This device is already set up.");
    state.profile = checkProfile(command.profile);
    state.team = [{ id: "patient", name: "Patient / self", archived: false }];
    for (const name of command.names || []) {
      const clean = text(name, "a caregiver name");
      if (state.team.some((p) => p.name.toLowerCase() === clean.toLowerCase()))
        fail("Caregiver names must be different.");
      state.team.push({
        id: crypto.randomUUID(),
        name: clean,
        archived: false,
      });
    }
    if (state.team.length > 100) fail("Use at most 99 caregiver names.");
    action = "Set up this bedside device";
  } else if (!state.profile) fail("Set up this device first.");
  else if (command.type === "plan") {
    checkPlan(command.plan);
    const checked = compileChecked(reconcilePlan(state.plan, command.plan));
    state.plan = checked.plan;
    state.profile = checkProfile(checked.plan);
    state.tasks = mergeTasks(state.tasks, checked.tasks);
    state.revision++;
    action = `Published care plan revision ${state.revision}`;
  } else if (command.type === "task") {
    const task = state.tasks.find((t) => t.id === command.patch?.id);
    if (!task || task.archived) fail("This task is no longer active.");
    const before = structuredClone(task);
    patchTask(state, task, command.patch, now);
    task.updatedAt = now;
    name = task.recordedByName || name;
    details = JSON.stringify({ before, after: structuredClone(task) });
    action = `Updated task: ${task.label} (${task.status})`;
  } else if (command.type === "caregiver") {
    const clean = text(command.name, "a caregiver name");
    if (
      state.team.some(
        (p) =>
          !p.archived &&
          p.name.toLowerCase() === clean.toLowerCase() &&
          p.id !== command.id,
      )
    )
      fail("That caregiver name is already in use.");
    if (command.id) {
      const person = member(state, command.id);
      if (!person || person.id === "patient")
        fail("Choose a caregiver to rename.");
      person.name = clean;
      action = "Renamed a caregiver";
    } else {
      if (state.team.filter((p) => !p.archived).length >= 100)
        fail("The caregiver list is full.");
      state.team.push({
        id: crypto.randomUUID(),
        name: clean,
        archived: false,
      });
      action = "Added a caregiver";
    }
  } else if (command.type === "remove-caregiver") {
    const person = member(state, command.id);
    if (!person || person.id === "patient")
      fail("The Patient / self entry cannot be removed.");
    person.archived = true;
    for (const task of state.tasks)
      if (task.who === person.id && task.status === "todo") task.who = "";
    action = "Removed a caregiver from the current list";
  } else if (command.type === "restore") {
    state = validateBackup(command.backup);
    action = "Restored a bedside backup";
  } else if (command.type === "reset") {
    if (command.confirm !== "DELETE")
      fail("Type DELETE to remove the record from this browser.");
    return { ...emptyRecord(), version: current.version + 1 };
  } else fail("Unknown change.");
  state.version = current.version + 1;
  state.audit.unshift({ action, name, at: now, details });
  return state;
}
