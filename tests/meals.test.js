process.env.TZ = "America/Los_Angeles";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mealWindow, fitsMealTime, validateMealWindows } from "../src/meals.js";
import { previewMealSettings } from "../src/meal-settings.js";
import { DEFAULT_MEALS, autoResolve, checkTimes } from "../src/scheduler.js";
import { fitsMedicineTime, timingStatus } from "../src/live-schedule.js";
import { generatePlanTasks, validateDatedTasks } from "../src/care-plan.js";
import {
  emptyRecord,
  normalizeRecord,
  validateBackup,
  BACKUP_FORMAT,
} from "../src/record.js";
const mealRanges = (dinner = { start: "17:30", end: "18:30" }) => ({
  breakfast: { start: "07:30", end: "08:30" },
  lunch: { start: "11:30", end: "12:30" },
  dinner,
});
const mealInstant = (clock) => new Date(`2026-10-25T${clock}:00`).getTime();
function mealPlan() {
  const record = emptyRecord();
  record.patient = { name: "Fictional meals", dischargeDate: "2026-10-25" };
  record.planStartAt = mealInstant("16:00");
  record.team = [{ id: "me", name: "Me" }];
  record.meds = [
    {
      id: "A",
      drug: "Fictional medicine",
      dose: "10 mg",
      freq: "twice daily",
      meal: "with",
      mealTarget: "any",
      gapH: 0,
      gapTarget: "",
    },
  ];
  record.schedule = autoResolve(record.meds, record.meals);
  record.tasks = generatePlanTasks(record);
  return record;
}
test("legacy meal clocks keep their old rules and default periods match them", () => {
  assert.deepEqual(mealWindow("08:00"), { start: "07:30", end: "08:30" });
  const ranges = mealRanges();
  for (let minute = 0; minute < 1440; minute++)
    assert.equal(
      fitsMealTime(minute, "with", DEFAULT_MEALS),
      fitsMealTime(minute, "with", ranges),
    );
  const old = emptyRecord();
  delete old.mealsConfigured;
  const normalized = normalizeRecord(old);
  assert.equal(normalized.mealsConfigured, false);
  assert.deepEqual(normalized.meals, DEFAULT_MEALS);
});
test("range boundaries, named meals, before-start and after-end agree across timing checks", () => {
  const ranges = mealRanges({ start: "16:30", end: "17:30" });
  const med = { freq: "twice daily", meal: "with", mealTarget: "dinner" };
  for (const [clock, expected] of [
    ["16:29", false],
    ["16:30", true],
    ["16:57", true],
    ["17:30", true],
    ["17:31", false],
    ["08:00", false],
  ])
    assert.equal(fitsMedicineTime(med, mealInstant(clock), ranges), expected);
  assert.equal(fitsMealTime(16 * 60 + 15, "before", ranges, "dinner"), true);
  assert.equal(fitsMealTime(16 * 60 + 16, "before", ranges, "dinner"), false);
  assert.equal(fitsMealTime(17 * 60 + 45, "after", ranges, "dinner"), true);
  assert.equal(fitsMealTime(18 * 60 + 31, "after", ranges, "dinner"), false);
});
test("meal setup works before a plan, rejects reversed and overlapping periods, and normalizes saved ranges", () => {
  const record = emptyRecord();
  const result = previewMealSettings(
    record,
    mealRanges(),
    mealInstant("16:00"),
  );
  assert.equal(result.ok, true);
  assert.equal(result.state.mealsConfigured, true);
  assert.equal(normalizeRecord(result.state).meals.dinner.start, "17:30");
  assert.equal(record.mealsConfigured, false);
  const bad = mealRanges({ start: "19:00", end: "18:00" });
  assert.ok(validateMealWindows(bad));
  bad.dinner = { start: "12:00", end: "18:00" };
  assert.match(validateMealWindows(bad), /overlapping/);
  assert.equal(previewMealSettings(record, bad).ok, false);
});
test("editing meal periods previews future changes, preserves dose identities and completed records, and round-trips backups", () => {
  const record = mealPlan();
  const first = record.tasks.find((task) => task.medId === "A");
  Object.assign(first, {
    status: "done",
    doneAt: mealInstant("16:57"),
    recordedBy: "me",
    recordedByName: "Me",
  });
  const original = structuredClone(record);
  const result = previewMealSettings(
    record,
    mealRanges({ start: "16:30", end: "17:30" }),
    mealInstant("16:57"),
  );
  assert.equal(result.ok, true);
  assert.ok(result.adjustments.length > 0);
  assert.deepEqual(
    result.state.tasks.find((task) => task.id === first.id),
    first,
  );
  assert.deepEqual(record, original);
  assert.deepEqual(
    result.state.tasks.map((task) => task.id).sort(),
    record.tasks.map((task) => task.id).sort(),
  );
  assert.deepEqual(
    checkTimes(
      result.state.meds,
      result.state.schedule.times,
      result.state.meals,
    ),
    [],
  );
  assert.deepEqual(
    validateDatedTasks(result.state, result.state.tasks, { pendingOnly: true }),
    [],
  );
  assert.equal(
    timingStatus(result.state, first, first.doneAt).reasons.some((reason) =>
      /food/.test(reason),
    ),
    false,
  );
  assert.deepEqual(
    validateBackup({ format: BACKUP_FORMAT, record: result.state }).meals,
    result.state.meals,
  );
});
test("confirming default periods keeps overdue events intact and infeasible edits leave the saved plan unchanged", () => {
  const record = mealPlan();
  const defaultResult = previewMealSettings(
    record,
    mealRanges(),
    mealInstant("20:00"),
  );
  assert.equal(defaultResult.ok, true);
  assert.deepEqual(defaultResult.state.tasks, record.tasks);
  const before = structuredClone(record);
  const failed = previewMealSettings(
    record,
    mealRanges({ start: "16:30", end: "17:30" }),
    mealInstant("20:00"),
  );
  assert.equal(failed.ok, false);
  assert.deepEqual(record, before);
});
