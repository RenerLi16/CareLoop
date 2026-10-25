import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyRecord,
  normalizeRecord,
  recordTask,
  updateCaregiver,
  validateBackup,
  BACKUP_FORMAT,
  timeCandidates,
  localInput,
} from "../src/record.js";
import { autoResolve } from "../src/scheduler.js";
import { generatePlanTasks } from "../src/care-plan.js";
import { protectFile, unlockFile } from "../src/file-protection.js";
process.env.TZ = "America/Los_Angeles";
const now = new Date("2026-10-25T12:00:00").getTime();
function fixture() {
  const r = emptyRecord();
  r.patient = { name: "Fictional", dischargeDate: "2026-10-25" };
  r.team = [
    { id: "a", name: "Lan", rel: "daughter" },
    { id: "b", name: "Minh", rel: "son" },
  ];
  r.meds = [
    {
      id: "A",
      drug: "A",
      dose: "10 mg",
      freq: "once daily",
      meal: "any",
      gapTarget: "",
      gapH: null,
    },
  ];
  r.schedule = autoResolve(r.meds);
  r.tasks = generatePlanTasks(r);
  return r;
}
const patch = (r) => ({
  id: r.tasks[0].id,
  status: "done",
  actualAt: now - 3600000,
  recordedBy: "a",
  note: "",
});
test("legacy JSON records normalize without losing names, tasks or timestamps", () => {
  const r = fixture();
  delete r.schema;
  delete r.revision;
  delete r.tasks[0].dueAt;
  const n = normalizeRecord(r);
  assert.equal(n.schema, 2);
  assert.equal(n.revision, 0);
  assert.equal(n.tasks[0].dueAt, new Date("2026-10-25T08:00:00").getTime());
});
test("records the actual time and recorder without changing the original object", () => {
  const r = fixture(),
    before = structuredClone(r),
    n = recordTask(r, patch(r), now);
  assert.equal(n.tasks[0].doneAt, now - 3600000);
  assert.equal(n.tasks[0].recordedByName, "Lan");
  assert.deepEqual(r, before);
});
test("saving an unchanged completed record does not replace the timestamp", () => {
  const r = fixture(),
    n = recordTask(r, patch(r), now),
    again = recordTask(n, patch(n), now + 60000);
  assert.deepEqual(again, n);
});
test("corrections require a reason and retain previous values", () => {
  const r = fixture(),
    n = recordTask(r, patch(r), now);
  assert.throws(
    () => recordTask(n, { ...patch(n), actualAt: now - 1800000 }, now),
    /reason/,
  );
  const corrected = recordTask(
    n,
    {
      ...patch(n),
      actualAt: now - 1800000,
      note: "Corrected the entered time",
    },
    now,
  );
  assert.equal(corrected.tasks[0].corrections[0].before.doneAt, now - 3600000);
  assert.equal(corrected.tasks[0].corrections[0].after.doneAt, now - 1800000);
});
test("explicitly reopening a mistaken record keeps its correction history", () => {
  const r = fixture(),
    n = recordTask(r, patch(r), now),
    reopened = recordTask(
      n,
      { ...patch(n), status: "todo", note: "Marked the wrong row" },
      now,
    );
  assert.equal(reopened.tasks[0].status, "todo");
  assert.equal(reopened.tasks[0].doneAt, null);
  assert.equal(reopened.tasks[0].corrections[0].before.status, "done");
});
test("future-day tasks, future actual times, and missing recorders are blocked", () => {
  const r = fixture();
  assert.throws(
    () =>
      recordTask(
        r,
        { ...patch(r), id: r.tasks.find((t) => t.date === "2026-10-26").id },
        now,
      ),
    /future day/,
  );
  assert.throws(
    () => recordTask(r, { ...patch(r), actualAt: now + 60000 }, now),
    /future/,
  );
  assert.throws(
    () => recordTask(r, { ...patch(r), recordedBy: "" }, now),
    /who is recording/,
  );
});
test("caregiver changes preserve recorded names and clear future pending assignments when removed", () => {
  const r = fixture();
  r.tasks[0].who = "a";
  let n = recordTask(r, patch(r), now);
  n = updateCaregiver(n, { id: "a", name: "Lan updated" }, "2026-10-25");
  assert.equal(n.tasks[0].recordedByName, "Lan");
  n = updateCaregiver(n, { id: "a", remove: true }, "2026-10-25");
  assert.equal(n.tasks[0].who, "a");
  assert.ok(
    n.tasks
      .filter((t) => t.status === "todo" && t.date >= "2026-10-25")
      .every((t) => t.who !== "a"),
  );
  assert.throws(
    () => updateCaregiver(n, { id: "b", remove: true }),
    /at least one/,
  );
});
test("caregiver names are editable without duplicate active names", () => {
  const r = fixture();
  assert.throws(
    () => updateCaregiver(r, { newId: "c", name: "LAN" }),
    /already in use/,
  );
  const n = updateCaregiver(r, {
    newId: "c",
    name: "Amy",
    rel: "granddaughter",
  });
  assert.equal(n.team.length, 3);
});
test("nonexistent and repeated wall-clock times are handled explicitly", () => {
  assert.deepEqual(timeCandidates("2026-03-08T02:30"), []);
  const repeated = timeCandidates("2026-11-01T01:30");
  assert.equal(repeated.length, 2);
  assert.equal(repeated[1] - repeated[0], 3600000);
  assert.equal(localInput(repeated[0]), localInput(repeated[1]));
});
test("backup validation rejects unrelated records, malformed corrections and invalid schedules", () => {
  const r = fixture();
  assert.throws(
    () => validateBackup({ format: "old-backup", record: r }),
    /not a backup/,
  );
  const malformed = structuredClone(r);
  malformed.tasks[0].corrections = [null];
  assert.throws(() => normalizeRecord(malformed));
  const invalid = structuredClone(r);
  invalid.schedule.times.A = ["99:00"];
  assert.throws(() =>
    validateBackup({ format: BACKUP_FORMAT, record: invalid }),
  );
  assert.equal(
    validateBackup({ format: BACKUP_FORMAT, record: r }).patient.name,
    "Fictional",
  );
});
test("encrypted backups round-trip without revealing record text and reject a wrong passphrase", async () => {
  const payload = { format: BACKUP_FORMAT, record: fixture() },
    pass = "fictional backup passphrase",
    encrypted = await protectFile(payload, pass);
  assert.ok(!JSON.stringify(encrypted).includes("Fictional"));
  assert.deepEqual(await unlockFile(encrypted, pass), payload);
  await assert.rejects(
    unlockFile(encrypted, "incorrect passphrase"),
    /Could not unlock/,
  );
});
