process.env.TZ = "America/Los_Angeles";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  homeQueue,
  timingStatus,
  resolveRemaining,
  taskDue,
} from "../src/live-schedule.js";
import { emptyRecord, validateBackup, BACKUP_FORMAT } from "../src/record.js";
import { autoResolve, DEFAULT_MEALS } from "../src/scheduler.js";
import { generatePlanTasks, preparePlanTasks } from "../src/care-plan.js";

const med = (id, extra = {}) => ({
  id,
  drug: id,
  dose: "10 mg",
  freq: "once daily",
  meal: "any",
  gapH: 0,
  gapTarget: "",
  ...extra,
});
const instant = (date, time) => new Date(`${date}T${time}:00`).getTime();
function plan(meds, days = 3) {
  const state = {
    patient: { dischargeDate: "2026-10-25" },
    meds,
    meals: { ...DEFAULT_MEALS },
    team: [{ id: "me", name: "Me" }],
    history: [],
    schedule: autoResolve(meds),
    tasks: [],
  };
  state.tasks = generatePlanTasks(state, days);
  return state;
}
const complete = (task, time) =>
  Object.assign(task, {
    status: "done",
    doneAt: instant(task.date, time),
    recordedBy: "me",
    recordedByName: "Me",
  });

test("next up is the first future pending task, while ALL earlier pending tasks are overdue", () => {
  const state = plan([med("Alpha", { freq: "twice daily" }), med("Beta")]);
  const now = instant("2026-10-25", "12:00");
  state.tasks.find((task) => task.medId === "Beta").status = "skip";
  let queue = homeQueue(state, now);
  assert.equal(queue.overdue.length, 1);
  assert.equal(queue.next.time, "20:00");
  state.tasks
    .filter((task) => task.date === "2026-10-25")
    .forEach((task) => (task.status = "done"));
  queue = homeQueue(state, now);
  assert.equal(queue.overdue.length, 0);
  assert.equal(queue.next.date, "2026-10-26");
  assert.equal(homeQueue(state, instant("2026-11-30", "12:00")).next, null);
  assert.ok(homeQueue(state, instant("2026-10-26", "12:00")).overdue.length);
});

test("five-minute target includes its boundaries but tightens for meal and recorded spacing rules", () => {
  const state = plan([
    med("Alpha", { meal: "before", mealTarget: "breakfast" }),
  ]);
  const task = state.tasks[0];
  task.time = "07:45";
  task.dueAt = instant(task.date, task.time);
  assert.equal(timingStatus(state, task, taskDue(task) - 300000).fits, true);
  assert.equal(timingStatus(state, task, taskDue(task) + 300000).fits, false);
  assert.equal(
    timingStatus(state, task, taskDue(task) - 300001).phase,
    "upcoming",
  );
  const pair = plan([
    med("Alpha", { gapH: 2, gapTarget: "Beta" }),
    med("Beta"),
  ]);
  const a = pair.tasks.find((t) => t.medId === "Alpha");
  const b = pair.tasks.find((t) => t.medId === "Beta");
  complete(a, "09:00");
  assert.equal(timingStatus(pair, b, instant(b.date, "10:00")).fits, false);
});

test("resolves around actual completion, preserves every record and dose, reorders pending tasks, persists on unchanged rebuild", () => {
  const state = plan([
    med("Alpha", { gapH: 2, gapTarget: "Beta" }),
    med("Beta"),
  ]);
  const a = state.tasks.find((task) => task.medId === "Alpha");
  complete(a, "09:30");
  const before = structuredClone(state);
  const result = resolveRemaining(state, instant(a.date, "09:30"));
  assert.equal(result.ok, true);
  const beta = result.state.tasks.find((task) => task.medId === "Beta");
  assert.equal(beta.time, "11:30");
  assert.deepEqual(
    result.state.tasks.find((task) => task.id === a.id),
    a,
  );
  assert.deepEqual(state, before);
  assert.deepEqual(result.state.meds, state.meds);
  assert.equal(result.state.tasks.length, state.tasks.length);
  assert.ok(result.adjustments.some((change) => change.id === beta.id));
  const rebuilt = preparePlanTasks(result.state, result.state, "2026-10-25");
  assert.equal(rebuilt.ok, true);
  assert.equal(rebuilt.tasks.find((task) => task.id === beta.id).time, "11:30");
});

test("exact elapsed intervals follow actual completion across the remaining days", () => {
  const state = plan([med("Alpha", { freq: "every 8 hours" })]);
  complete(state.tasks[0], "07:00");
  const result = resolveRemaining(state, instant("2026-10-25", "07:00"));
  assert.equal(result.ok, true);
  const tasks = result.state.tasks;
  for (let i = 1; i < tasks.length; i++)
    assert.equal(
      taskDue(tasks[i]) - (i === 1 ? tasks[0].doneAt : taskDue(tasks[i - 1])),
      8 * 3600000,
    );
  assert.equal(tasks[1].time, "15:00");
});

test("does not rewrite history or relax a fixed time, food rule, or spacing when no solution is found", () => {
  const state = plan([
    med("Alpha", { gapH: 2, gapTarget: "Beta" }),
    med("Beta", { freq: "in the morning" }),
  ]);
  const a = state.tasks.find((task) => task.medId === "Alpha");
  complete(a, "09:30");
  const before = structuredClone(state);
  assert.equal(resolveRemaining(state, instant(a.date, "09:30")).ok, false);
  assert.deepEqual(state, before);
  const food = plan([
    med("Alpha", { meal: "before", mealTarget: "breakfast" }),
  ]);
  assert.equal(
    resolveRemaining(food, instant("2026-10-25", "09:30")).ok,
    false,
  );
  assert.equal(
    resolveRemaining(before, instant(a.date, "09:30"), 0).limited,
    true,
  );
});

test("cross-midnight spacing uses actual prior-day records and the resolver leaves older overdue tasks alone", () => {
  const state = plan([
    med("Alpha", { gapH: 4, gapTarget: "Beta" }),
    med("Beta"),
  ]);
  const a = state.tasks.find((task) => task.medId === "Alpha");
  complete(a, "23:00");
  const result = resolveRemaining(state, instant("2026-10-26", "00:00"));
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.state.tasks.find((task) => task.id === a.id),
    a,
  );
  const oldBeta = state.tasks.find((task) => task.medId === "Beta");
  assert.deepEqual(
    result.state.tasks.find((task) => task.id === oldBeta.id),
    oldBeta,
  );
  assert.ok(
    result.state.tasks
      .filter((task) => task.date === "2026-10-26")
      .every(
        (task) =>
          taskDue(task) >= a.doneAt + (task.medId === "Beta" ? 4 : 0) * 3600000,
      ),
  );
});

test("resolved exact intervals remain valid through DST and can be backed up/restored", () => {
  const state = {
    ...emptyRecord(),
    ...plan([med("Alpha", { freq: "every 8 hours" })], 30),
  };
  state.patient.name = "Fictional interval backup";
  state.team[0].rel = "self";
  complete(state.tasks[0], "07:00");
  const result = resolveRemaining(state, instant("2026-10-25", "07:00"));
  assert.equal(result.ok, true);
  for (let i = 1; i < result.state.tasks.length; i++)
    assert.equal(
      taskDue(result.state.tasks[i]) -
        (i === 1
          ? result.state.tasks[0].doneAt
          : taskDue(result.state.tasks[i - 1])),
      8 * 3600000,
    );
  assert.equal(
    validateBackup({ format: BACKUP_FORMAT, record: result.state }).tasks
      .length,
    state.tasks.length,
  );
  const rebuilt = preparePlanTasks(result.state, result.state, "2026-10-25");
  assert.equal(rebuilt.ok, true);
});
