import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyRecord, changeRecord, makeBackup } from "../src/care-record.js";
import { DEFAULT_PREFS } from "../src/domain.js";
const now = "2026-10-25T18:00:00.000Z";
const profile = {
  patient: "Fictional Person",
  startDate: "2026-10-24",
  timeZone: "America/Los_Angeles",
  prefs: DEFAULT_PREFS,
};
const plan = {
  ...profile,
  meds: [
    {
      id: "a",
      drug: "Example A",
      dose: "10 mg",
      freq: "once daily",
      meal: "any",
      gapTarget: "",
      gapHours: "",
      reviewed: true,
    },
  ],
  followups: [],
  flags: [],
  monitoring: { weight: true, symptoms: true },
  unresolved: [],
};
const change = (s, command) => changeRecord(s, command, s.version, now);
const setup = () =>
  change(emptyRecord(), { type: "setup", profile, names: ["Lan"] });
const published = () => change(setup(), { type: "plan", plan });
test("setup stores only a local profile and caregiver labels, without credentials", () => {
  const record = setup();
  assert.equal(record.profile.patient, profile.patient);
  assert.equal(record.team[0].id, "patient");
  assert.equal(record.team[1].name, "Lan");
  assert.equal(record.version, 1);
  for (const key of ["user", "password", "email", "session", "role"])
    assert.equal(record[key], undefined);
  assert.throws(
    () => change(record, { type: "setup", profile }),
    /already set up/,
  );
});
test("setup rejects invalid dates, missing names, and invalid routine times", () => {
  for (const patch of [
    { patient: "" },
    { startDate: "2026-02-31" },
    { timeZone: "Not/AZone" },
    { prefs: { breakfast: "90:00" } },
  ])
    assert.throws(() =>
      change(emptyRecord(), {
        type: "setup",
        profile: { ...profile, ...patch },
      }),
    );
  assert.throws(
    () =>
      change(emptyRecord(), { type: "setup", profile, names: ["Lan", "LAN"] }),
    /different/,
  );
});
test("publication retains parsing and scheduling validation", () => {
  const initial = setup();
  assert.throws(
    () =>
      change(initial, {
        type: "plan",
        plan: { ...plan, meds: [{ ...plan.meds[0], reviewed: false }] },
      }),
    /Review/,
  );
  assert.throws(
    () => change(initial, { type: "plan", plan: { meds: [null] } }),
    /Invalid/,
  );
  const record = published();
  assert.equal(record.tasks.length, 90);
  assert.equal(record.revision, 1);
  assert.equal(initial.plan, null);
});
test("recording requires an actual time and a named local recorder", () => {
  const record = published(),
    task = record.tasks.find((t) => t.kind === "med");
  for (const patch of [
    { actualAt: null, recordedBy: "patient" },
    { actualAt: now, recordedBy: "" },
    { actualAt: "2026-10-26T18:00:00.000Z", recordedBy: "patient" },
  ])
    assert.throws(() =>
      change(record, {
        type: "task",
        patch: { id: task.id, status: "done", ...patch },
      }),
    );
  const next = change(record, {
    type: "task",
    patch: {
      id: task.id,
      status: "done",
      actualAt: now,
      recordedBy: record.team[1].id,
    },
  });
  assert.equal(next.tasks[0].recordedByName, "Lan");
  assert.equal(next.tasks[0].actualAt, now);
  assert.equal(record.tasks[0].status, "todo");
  const audit = JSON.parse(next.audit[0].details);
  assert.equal(audit.before.status, "todo");
  assert.equal(audit.after.status, "done");
});
test("weight and symptom entries are validated locally before mutation", () => {
  const record = published(),
    weight = record.tasks.find((t) => t.kind === "weight"),
    symptoms = record.tasks.find((t) => t.kind === "symptoms");
  const base = { status: "done", actualAt: now, recordedBy: "patient" };
  assert.throws(
    () =>
      change(record, {
        type: "task",
        patch: { ...base, id: weight.id, value: "bad", unit: "kg" },
      }),
    /weight/,
  );
  assert.throws(
    () =>
      change(record, {
        type: "task",
        patch: { ...base, id: symptoms.id, value: "" },
      }),
    /symptoms/,
  );
  const saved = change(record, {
    type: "task",
    patch: { ...base, id: weight.id, value: "64.5", unit: "kg" },
  });
  assert.deepEqual(saved.tasks.find((t) => t.id === weight.id).value, {
    amount: 64.5,
    unit: "kg",
  });
});
test("renaming and removing caregivers preserves attribution and clears pending assignments", () => {
  let record = published();
  const person = record.team[1];
  record = change(record, {
    type: "task",
    patch: {
      id: record.tasks[0].id,
      status: "done",
      actualAt: now,
      recordedBy: person.id,
      who: person.id,
    },
  });
  record = change(record, {
    type: "task",
    patch: { id: record.tasks[1].id, who: person.id },
  });
  record = change(record, {
    type: "caregiver",
    id: person.id,
    name: "Lan updated",
  });
  assert.equal(record.tasks[0].recordedByName, "Lan");
  record = change(record, { type: "remove-caregiver", id: person.id });
  assert.equal(record.tasks[0].who, person.id);
  assert.equal(record.tasks[1].who, "");
  assert.equal(record.team[1].archived, true);
  assert.throws(
    () => change(record, { type: "remove-caregiver", id: "patient" }),
    /cannot be removed/,
  );
});
test("revisions preserve completed history and unchanged assignments", () => {
  let record = published();
  record = change(record, {
    type: "task",
    patch: {
      id: record.tasks[0].id,
      status: "done",
      actualAt: now,
      recordedBy: "patient",
    },
  });
  record = change(record, {
    type: "plan",
    plan: { ...plan, meds: [{ ...plan.meds[0], freq: "at bedtime" }] },
  });
  assert.equal(record.tasks[0].time, "08:00");
  assert.equal(record.tasks[0].status, "done");
  assert.equal(record.revision, 2);
});
test("stale writes fail without changing the record, including after deletion", () => {
  const record = setup();
  assert.throws(
    () => changeRecord(record, { type: "caregiver", name: "Other" }, 0, now),
    (e) => e.status === 409,
  );
  const deleted = change(record, { type: "reset", confirm: "DELETE" });
  assert.equal(deleted.version, record.version + 1);
  assert.equal(deleted.profile, null);
  assert.deepEqual(deleted.audit, []);
  assert.throws(
    () =>
      changeRecord(
        deleted,
        { type: "caregiver", name: "Other" },
        record.version,
        now,
      ),
    (e) => e.status === 409,
  );
  assert.throws(
    () => change(record, { type: "reset", confirm: "no" }),
    /DELETE/,
  );
});
test("backup round-trip preserves caregivers, completion and activity", () => {
  let record = published();
  record = change(record, {
    type: "task",
    patch: {
      id: record.tasks[0].id,
      status: "done",
      actualAt: now,
      recordedBy: "patient",
    },
  });
  const backup = makeBackup(record, now);
  const restored = change(setup(), { type: "restore", backup });
  assert.deepEqual(restored.tasks, record.tasks);
  assert.deepEqual(restored.team, record.team);
  assert.equal(restored.audit.length, record.audit.length + 1);
  assert.equal(restored.version, 2);
});
test("restore rejects malformed, old-server and incompatible backups without changing data", () => {
  const record = published(),
    backup = makeBackup(record, now);
  for (const bad of [
    null,
    { format: "careloop-1" },
    { ...backup, record: { ...backup.record, schemaVersion: 99 } },
    {
      ...backup,
      record: {
        ...backup.record,
        tasks: [{ ...backup.record.tasks[0], actualAt: "bad" }],
      },
    },
    {
      ...backup,
      record: {
        ...backup.record,
        audit: [{ action: "changed", name: "test", at: "bad" }],
      },
    },
  ])
    assert.throws(() => change(record, { type: "restore", backup: bad }));
  assert.equal(record.tasks.length, 90);
});

test("correcting a measured task to skipped clears the measurement and preserves it in audit history", () => {
  let record = published();
  const weight = record.tasks.find((task) => task.kind === "weight");
  record = change(record, {
    type: "task",
    patch: {
      id: weight.id,
      status: "done",
      actualAt: now,
      recordedBy: "patient",
      value: "64.5",
      unit: "kg",
    },
  });
  record = change(record, {
    type: "task",
    patch: {
      id: weight.id,
      status: "skipped",
      actualAt: now,
      recordedBy: "patient",
    },
  });
  assert.equal(record.tasks.find((task) => task.id === weight.id).value, null);
  assert.deepEqual(JSON.parse(record.audit[0].details).before.value, {
    amount: 64.5,
    unit: "kg",
  });
});
