import { test } from "node:test";
import assert from "node:assert/strict";
import { autoResolve, DEFAULT_MEALS } from "../src/scheduler.js";
import {
  generatePlanTasks,
  preparePlanTasks,
  validateDatedTasks,
} from "../src/care-plan.js";
process.env.TZ = "America/Los_Angeles";
const med = (id, extra = {}) => ({
  id,
  drug: id,
  dose: "10 mg",
  freq: "once daily",
  meal: "any",
  mealTarget: "any",
  gapH: null,
  gapTarget: "",
  ...extra,
});
const plan = (meds, extra = {}) => {
  const p = {
    patient: { name: "Fictional", dischargeDate: "2026-10-25" },
    meds,
    meals: { ...DEFAULT_MEALS },
    team: [{ id: "p", name: "Test" }],
    followups: [],
    history: [],
    tasks: [],
    ...extra,
  };
  p.schedule = autoResolve(p.meds, p.meals);
  return p;
};
test("exact elapsed intervals survive both spring and fall clock changes", () => {
  for (const start of ["2026-03-01", "2026-10-25"])
    for (const hours of [6, 8, 12]) {
      const p = plan([med("A", { freq: `every ${hours} hours` })], {
          patient: { name: "Test", dischargeDate: start },
        }),
        tasks = generatePlanTasks(p);
      assert.ok(tasks.length);
      for (let i = 1; i < tasks.length; i++)
        assert.equal(tasks[i].dueAt - tasks[i - 1].dueAt, hours * 3600000);
      const changes = new Set(tasks.map((t) => t.time));
      assert.ok(
        changes.size > 24 / hours,
        "Displayed local times must shift across DST",
      );
      assert.deepEqual(validateDatedTasks(p, tasks), []);
    }
});
test("clock-change shifts cannot silently break food or pair spacing rules", () => {
  const p = plan([med("A", { freq: "every 12 hours", meal: "with" })], {
    meals: { breakfast: "08:00", lunch: "12:00", dinner: "20:00" },
  });
  assert.equal(p.schedule.ok, true);
  assert.match(
    validateDatedTasks(p, generatePlanTasks(p)).join(" "),
    /clock change/,
  );
  const pair = plan([
    med("A", { freq: "in the morning" }),
    med("B", { freq: "every 12 hours", gapH: 4, gapTarget: "A" }),
  ]);
  const tasks = generatePlanTasks(pair);
  const altered = tasks.map((t) => ({ ...t }));
  const sameDay = altered.filter((t) => t.date === "2026-10-25");
  sameDay.find((t) => t.medId === "B").dueAt = sameDay.find(
    (t) => t.medId === "A",
  ).dueAt;
  assert.ok(validateDatedTasks(pair, altered).length);
});
test("replanning around a recorded dose is blocked without changing the original record", () => {
  const p = plan([med("A"), med("B", { gapH: 2, gapTarget: "A" })]);
  p.tasks = generatePlanTasks(p);
  p.tasks[0].status = "done";
  p.tasks[0].doneAt = p.tasks[0].dueAt;
  const before = structuredClone(p);
  const next = {
    ...p,
    meds: p.meds.map((m) => ({ ...m, meal: m.id === "A" ? "with" : "any" })),
    meals: { breakfast: "10:00", lunch: "12:00", dinner: "18:00" },
  };
  next.schedule = autoResolve(next.meds, next.meals);
  const result = preparePlanTasks(p, next, "2026-10-25");
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /already recorded today/);
  assert.deepEqual(p, before);
});
test("unchanged rebuilds preserve completion records and pending assignments", () => {
  const p = plan([med("A")]);
  p.tasks = generatePlanTasks(p);
  p.tasks[0].status = "done";
  p.tasks[0].doneAt = p.tasks[0].dueAt;
  p.tasks[1].who = "changed";
  const result = preparePlanTasks(p, structuredClone(p), "2026-10-25");
  assert.equal(result.ok, true);
  assert.deepEqual(result.tasks[0], p.tasks[0]);
  assert.equal(result.tasks[1].who, "changed");
});
test("changed recorded tasks become history on a later day", () => {
  const p = plan([med("A")]);
  p.tasks = generatePlanTasks(p);
  p.tasks[0].status = "done";
  p.tasks[0].doneAt = p.tasks[0].dueAt;
  const next = plan([med("B")]);
  const result = preparePlanTasks(p, next, "2026-10-26");
  assert.equal(result.ok, true);
  assert.equal(result.history[0].id, p.tasks[0].id);
});
test("zero-day followup is on the discharge date and labels are plain stored text", () => {
  const p = plan([med("A", { drug: "<text>" })], {
    followups: [{ id: "f", who: "Oncology", days: 0 }],
  });
  const tasks = generatePlanTasks(p);
  assert.equal(tasks.find((t) => t.kind === "visit").date, "2026-10-25");
  assert.equal(tasks.find((t) => t.kind === "med").label, "<text> 10 mg");
});
test("a legacy recorded time cannot be merged into a clock-change timetable with a broken exact interval", () => {
  const p = plan([med("A", { freq: "every 12 hours" })]);
  p.tasks = generatePlanTasks(p);
  const changed = p.tasks.find(
    (task) => task.date === "2026-11-01" && task.time === "07:00",
  );
  changed.time = "08:00";
  changed.dueAt = new Date("2026-11-01T08:00:00").getTime();
  changed.status = "done";
  changed.doneAt = changed.dueAt;
  const result = preparePlanTasks(p, structuredClone(p), "2026-10-25");
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /12-hour interval/);
});
