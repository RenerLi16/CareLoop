import { DEFAULT_MEALS, checkTimes, FREQUENCIES } from "./scheduler.js";
import { validateDatedTasks } from "./care-plan.js";
export const RECORD_KEY = "careloop_instructor_resolver_v1";
export const BACKUP_FORMAT = "careloop-compact-backup-1";
export const dayOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const localInput = (epoch) => {
  const d = new Date(epoch);
  return `${dayOf(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export function timeCandidates(input) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input || "")) return [];
  const base = new Date(input).getTime();
  if (!Number.isFinite(base)) return [];
  const found = [];
  for (let offset = -180; offset <= 180; offset += 15) {
    const value = base + offset * 60000;
    if (localInput(value) === input) found.push(value);
  }
  return [...new Set(found)].sort((a, b) => a - b);
}
export function emptyRecord() {
  return {
    schema: 2,
    revision: 0,
    patient: null,
    meds: [],
    followups: [],
    flags: [],
    weigh: true,
    symptoms: true,
    tasks: [],
    team: [],
    schedule: null,
    meals: { ...DEFAULT_MEALS },
    history: [],
    audit: [],
    rawText: "",
    unread: [],
    reviewedUnread: false,
  };
}
const short = (value, max = 100) =>
  typeof value === "string" && value.length <= max;
const validDay = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value || "") &&
  dayOf(new Date(value + "T12:00:00")) === value;
const validClock = (value) =>
  /^\d{2}:\d{2}$/.test(value || "") &&
  +value.slice(0, 2) < 24 &&
  +value.slice(3) < 60;
function requireValue(
  condition,
  message = "This care record has an unsupported or invalid format.",
) {
  if (!condition) throw new Error(message);
}
export function normalizeRecord(input) {
  requireValue(input && typeof input === "object" && !Array.isArray(input));
  const value = { ...emptyRecord() };
  for (const key of Object.keys(value))
    if (Object.hasOwn(input, key)) value[key] = structuredClone(input[key]);
  requireValue(Number.isSafeInteger(value.revision) && value.revision >= 0);
  for (const key of [
    "meds",
    "followups",
    "flags",
    "tasks",
    "team",
    "history",
    "audit",
    "unread",
  ])
    requireValue(Array.isArray(value[key]));
  requireValue(
    value.meds.length <= 15 &&
      value.team.length <= 100 &&
      value.tasks.length <= 10000 &&
      value.history.length <= 10000 &&
      value.audit.length <= 10000,
  );
  requireValue(
    value.patient === null ||
      (short(value.patient.name) &&
        value.patient.name.trim() &&
        validDay(value.patient.dischargeDate)),
  );
  requireValue(
    typeof value.weigh === "boolean" &&
      typeof value.symptoms === "boolean" &&
      typeof value.reviewedUnread === "boolean",
  );
  requireValue(
    value.flags.every((flag) => short(flag, 10000)) &&
      value.unread.every((line) => short(line, 10000)) &&
      short(value.rawText, 500000),
  );
  const ids = new Set();
  const validId = (id) =>
    short(id) &&
    /^[A-Za-z0-9_-]+$/.test(id) &&
    !["__proto__", "constructor", "prototype"].includes(id);
  for (const person of value.team) {
    requireValue(
      person &&
        validId(person.id) &&
        person.id &&
        !ids.has(person.id) &&
        short(person.name) &&
        person.name.trim() &&
        short(person.rel || "", 100),
    );
    requireValue(
      person.archived === undefined || typeof person.archived === "boolean",
    );
    ids.add(person.id);
  }
  const medIds = new Set();
  for (const med of value.meds) {
    requireValue(
      med &&
        validId(med.id) &&
        med.id &&
        !medIds.has(med.id) &&
        short(med.drug, 200) &&
        med.drug.trim() &&
        short(med.dose, 200) &&
        short(med.freq, 100),
    );
    medIds.add(med.id);
    requireValue(
      FREQUENCIES.includes(med.freq) &&
        ["any", "with", "before", "after"].includes(med.meal) &&
        short(med.gapTarget || "", 200),
    );
  }
  requireValue(
    value.meals &&
      Object.keys(DEFAULT_MEALS).every((key) => validClock(value.meals[key])),
  );
  const taskIds = new Set(),
    currentTasks = new Set(value.tasks);
  for (const task of [...value.tasks, ...value.history]) {
    requireValue(
      task &&
        short(task.id, 250) &&
        task.id &&
        validDay(task.date) &&
        validClock(task.time) &&
        short(task.label, 500) &&
        ["todo", "done", "skip"].includes(task.status) &&
        ["med", "weight", "symptom", "visit"].includes(task.kind),
    );
    if (currentTasks.has(task)) {
      requireValue(!taskIds.has(task.id));
      taskIds.add(task.id);
    }
    requireValue(
      task.doneAt == null || (Number.isFinite(task.doneAt) && task.doneAt >= 0),
    );
    if (task.dueAt == null)
      task.dueAt = new Date(task.date + "T" + task.time + ":00").getTime();
    requireValue(Number.isFinite(task.dueAt));
    requireValue(task.recordedBy == null || short(task.recordedBy));
    requireValue(task.recordedByName == null || short(task.recordedByName));
    requireValue(task.note == null || short(task.note, 2000));
    requireValue(
      task.corrections == null ||
        (Array.isArray(task.corrections) && task.corrections.length <= 1000),
    );
    for (const change of task.corrections || [])
      requireValue(
        change &&
          Number.isFinite(change.at) &&
          short(change.by) &&
          short(change.reason, 2000) &&
          change.before &&
          change.after &&
          ["todo", "done", "skip"].includes(change.before.status) &&
          ["todo", "done", "skip"].includes(change.after.status),
      );
  }
  if (value.patient) {
    requireValue(
      value.schedule &&
        value.schedule.ok === true &&
        value.schedule.times &&
        typeof value.schedule.times === "object",
    );
    for (const med of value.meds)
      requireValue(
        Array.isArray(value.schedule.times[med.id]) &&
          value.schedule.times[med.id].length >= 1 &&
          value.schedule.times[med.id].length <= 4 &&
          value.schedule.times[med.id].every(validClock),
      );
    value.schedule.adjustments = value.schedule.adjustments || [];
    requireValue(Array.isArray(value.schedule.adjustments));
    for (const adjustment of value.schedule.adjustments)
      requireValue(
        adjustment &&
          short(adjustment.drug, 200) &&
          Array.isArray(adjustment.before) &&
          adjustment.before.every(validClock) &&
          Array.isArray(adjustment.after) &&
          adjustment.after.every(validClock) &&
          short(adjustment.reason, 5000),
      );
    value.schedule.violations = value.schedule.violations || [];
    requireValue(
      Array.isArray(value.schedule.violations) &&
        value.schedule.violations.every((v) => v && short(v.msg, 5000)),
    );
  }
  requireValue(
    value.audit.every(
      (entry) =>
        entry &&
        Number.isFinite(entry.at) &&
        short(entry.action) &&
        short(entry.by),
    ),
  );
  if (!value.patient)
    requireValue(!value.tasks.length && !value.meds.length && !value.schedule);
  value.schema = 2;
  return value;
}
export function validateBackup(payload) {
  requireValue(
    payload?.format === BACKUP_FORMAT,
    "This is not a backup from the current CareLoop app.",
  );
  const record = normalizeRecord(payload.record);
  requireValue(record.patient, "The backup has no care plan.");
  requireValue(
    checkTimes(record.meds, record.schedule.times, record.meals).length === 0,
    "The backup’s timing rules need review before it can be restored.",
  );
  requireValue(
    validateDatedTasks(
      record,
      record.tasks.filter((task) => task.date >= dayOf(new Date())),
      { pendingOnly: true },
    ).length === 0,
    "The backup’s dated timetable needs review before it can be restored.",
  );
  return record;
}
const taskSnapshot = (task) => ({
  status: task.status,
  doneAt: task.doneAt ?? null,
  recordedBy: task.recordedBy || "",
  recordedByName: task.recordedByName || "",
  note: task.note || "",
});
export function recordTask(record, patch, now = Date.now()) {
  const next = structuredClone(record),
    task = next.tasks.find((t) => t.id === patch.id);
  requireValue(task, "This task no longer exists. Reload the saved plan.");
  requireValue(
    ["todo", "done", "skip"].includes(patch.status),
    "Choose completed, skipped, or pending.",
  );
  const person = next.team.find(
    (p) => p.id === patch.recordedBy && !p.archived,
  );
  requireValue(person, "Choose who is recording.");
  if (patch.status !== "todo") {
    requireValue(
      task.date <= dayOf(new Date(now)),
      "A future day’s task cannot be recorded yet.",
    );
    requireValue(
      Number.isFinite(patch.actualAt) &&
        patch.actualAt >= 0 &&
        patch.actualAt <= now,
      "Enter the actual time; it cannot be in the future.",
    );
  }
  const note = String(patch.note || "").trim();
  requireValue(note.length <= 2000, "Keep the note under 2,000 characters.");
  const before = taskSnapshot(task),
    after = {
      status: patch.status,
      doneAt: patch.status === "todo" ? null : patch.actualAt,
      recordedBy: patch.status === "todo" ? "" : person.id,
      recordedByName:
        patch.status === "todo"
          ? ""
          : task.recordedBy === person.id
            ? task.recordedByName || person.name
            : person.name,
      note,
    };
  if (JSON.stringify(before) === JSON.stringify(after)) return next;
  if (task.status !== "todo") {
    const reason = String(patch.reason ?? note).trim();
    requireValue(
      reason && reason.length <= 2000,
      "Enter a reason for correcting the record (under 2,000 characters).",
    );
    task.corrections = [
      ...(task.corrections || []),
      { at: now, by: person.name, before, after, reason },
    ];
  }
  Object.assign(task, after);
  next.audit = [
    ...(next.audit || []),
    {
      at: now,
      action: before.status === "todo" ? "record" : "correct",
      taskId: task.id,
      by: person.name,
    },
  ].slice(-10000);
  return next;
}
export function updateCaregiver(
  record,
  { id, name, rel = "", remove = false, newId },
  today = dayOf(new Date()),
) {
  const next = structuredClone(record),
    active = next.team.filter((p) => !p.archived),
    person = next.team.find((p) => p.id === id && !p.archived);
  if (remove) {
    requireValue(person, "This caregiver was already removed.");
    requireValue(active.length > 1, "Keep at least one caregiver name.");
    person.archived = true;
    for (const task of next.tasks)
      if (task.who === id && task.status === "todo" && task.date >= today)
        task.who = "";
  } else {
    name = String(name || "").trim();
    rel = String(rel || "").trim();
    requireValue(
      name && name.length <= 100 && rel.length <= 100,
      "Enter a name under 100 characters.",
    );
    requireValue(
      !active.some(
        (p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase(),
      ),
      "That caregiver name is already in use.",
    );
    if (id) {
      requireValue(person, "This caregiver was removed.");
      person.name = name;
      person.rel = rel;
    } else {
      requireValue(
        short(newId) && newId && !next.team.some((p) => p.id === newId),
        "Invalid caregiver identity.",
      );
      next.team.push({ id: newId, name, rel });
    }
  }
  return next;
}
