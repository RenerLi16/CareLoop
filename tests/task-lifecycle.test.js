import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyRecord,
  discardExpiredTasks,
  isTaskExpired,
  normalizeRecord,
  recordTask,
} from "../src/record.js";
import { autoResolve } from "../src/scheduler.js";
import { generatePlanTasks, preparePlanTasks } from "../src/care-plan.js";
import { createRecordStore } from "../src/record-store.js";
process.env.TZ = "America/Los_Angeles";
const at = (value) => new Date(value).getTime();
function fixture() {
  const state = emptyRecord();
  state.patient = { name: "Fictional lifecycle", dischargeDate: "2026-10-23" };
  state.team = [{ id: "me", name: "Me", rel: "self" }];
  state.meds = [
    {
      id: "A",
      drug: "Alpha",
      dose: "10 mg",
      freq: "every 8 hours",
      meal: "any",
      gapH: 0,
      gapTarget: "",
    },
  ];
  state.schedule = autoResolve(state.meds);
  return state;
}

test("new discharge tasks start at the load instant while retaining the original discharge date", () => {
  const state = fixture();
  state.planStartAt = at("2026-10-25T12:23:45");
  state.followups = [{ id: "visit", who: "Primary care", days: 0 }];
  const tasks = generatePlanTasks(state);
  assert.ok(tasks.length);
  assert.ok(tasks.every((task) => task.dueAt >= state.planStartAt));
  assert.equal(state.patient.dischargeDate, "2026-10-23");
  assert.equal(tasks[0].date, "2026-10-25");
  assert.equal(tasks.find((task) => task.kind === "med").time, "14:00");
  assert.equal(
    tasks.find((task) => task.kind === "visit").dueAt,
    state.planStartAt,
  );
  assert.ok(
    !tasks.some((task) => task.date === "2026-10-25" && task.kind === "weight"),
  );
  const meds = tasks.filter((task) => task.kind === "med");
  for (let i = 1; i < meds.length; i++)
    assert.equal(meds[i].dueAt - meds[i - 1].dueAt, 8 * 3600000);
  state.tasks = tasks;
  const reopened = normalizeRecord(JSON.parse(JSON.stringify(state)));
  assert.equal(reopened.planStartAt, state.planStartAt);
  assert.deepEqual(
    preparePlanTasks(reopened, reopened, "2026-10-25").tasks,
    tasks,
  );
});

test("expiry discards only pending items strictly more than 24 elapsed hours late, of every kind", () => {
  const state = fixture(),
    now = at("2026-11-01T12:00:00");
  const make = (id, kind, dueAt, status = "todo") => ({
    id,
    kind,
    dueAt,
    date: "2026-10-31",
    time: "12:00",
    label: id,
    status,
    doneAt: null,
  });
  state.tasks = [
    make("med", "med", now - 86400001),
    make("weight", "weight", now - 86400001),
    make("symptom", "symptom", now - 86400001),
    make("visit", "visit", now - 86400001),
    make("boundary", "med", now - 86400000),
    make("recent", "med", now - 86399999),
    make("done", "med", now - 172800000, "done"),
    make("skip", "med", now - 172800000, "skip"),
    make("future", "med", now + 1),
  ];
  state.tasks[6].doneAt = now - 1000;
  const original = structuredClone(state),
    result = discardExpiredTasks(state, now);
  assert.deepEqual(state, original);
  assert.deepEqual(
    result.tasks
      .filter((task) => task.status === "discarded")
      .map((task) => task.id),
    ["med", "weight", "symptom", "visit"],
  );
  assert.deepEqual(result.tasks[6], original.tasks[6]);
  assert.equal(result.audit.length, 1);
  assert.equal(
    discardExpiredTasks(result, now),
    result,
    "Repeating cleanup is a no-op",
  );
  assert.equal(
    isTaskExpired({ status: "todo", dueAt: at("2026-10-31T12:30:00") }, now),
    true,
    "Fall clock change uses 24 real hours, not the wall-clock day",
  );
});

test("discarded items survive reload and a rebuild without becoming pending again", () => {
  const state = fixture();
  state.tasks = generatePlanTasks(state);
  const now = at("2026-10-25T12:00:00");
  const expired = discardExpiredTasks(state, now);
  const restored = normalizeRecord(JSON.parse(JSON.stringify(expired)));
  const result = preparePlanTasks(restored, restored, "2026-10-25");
  assert.equal(result.ok, true);
  for (const task of restored.tasks.filter(
    (task) => task.status === "discarded",
  ))
    assert.equal(
      result.tasks.find((item) => item.id === task.id).status,
      "discarded",
    );
  assert.throws(
    () =>
      recordTask(
        restored,
        {
          id: restored.tasks[0].id,
          status: "done",
          recordedBy: "me",
          actualAt: now,
        },
        now,
      ),
    /expired/,
  );
});

test("automatic expiry locks the latest record and never discards a concurrent completion", async () => {
  const state = fixture();
  state.tasks = generatePlanTasks(state);
  const map = new Map();
  const storage = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
  };
  let tail = Promise.resolve();
  const locks = {
    request: (_key, _opts, fn) => {
      const result = tail.then(fn);
      tail = result.catch(() => {});
      return result;
    },
  };
  const store = createRecordStore(storage, locks);
  const { RECORD_KEY } = await import("../src/record.js");
  storage.setItem(RECORD_KEY, JSON.stringify(state));
  const now = at("2026-10-25T12:00:00");
  const completion = locks.request(
    "careloop-record-write",
    { mode: "exclusive" },
    async () => {
      await Promise.resolve();
      const latest = store.read().record;
      latest.tasks[0].status = "done";
      latest.tasks[0].doneAt = latest.tasks[0].dueAt;
      storage.setItem(RECORD_KEY, JSON.stringify(latest));
    },
  );
  const expiry = store.discardExpired(now);
  const [, first] = await Promise.all([completion, expiry]);
  assert.equal(first.record.tasks[0].status, "done");
  assert.ok(first.record.tasks.some((task) => task.status === "discarded"));
  const second = await store.discardExpired(now);
  assert.equal(second.token, first.token);
  assert.equal(second.record.revision, first.record.revision);
});
