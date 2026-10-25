import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planDays,
  timelineGroups,
  caregiverLoads,
  conflictExample,
  calendarMonth,
} from "../src/plan-views.js";
const item = (id, date, time = "08:00", status = "todo", extra = {}) => ({
  id,
  date,
  time,
  dueAt: `${date}T${time}:00Z`,
  status,
  archived: false,
  kind: "med",
  medId: "a",
  label: "Example A 10 mg",
  who: "",
  ...extra,
});
test("the 30-day plan has exactly 30 dates across months and never silently includes outside visits", () => {
  const tasks = [
    item("a", "2026-10-25"),
    item("b", "2026-11-23", "08:00", "done"),
    item("outside", "2026-12-01", "09:00", "todo", { kind: "visit" }),
  ];
  const days = planDays({ startDate: "2026-10-25" }, tasks);
  assert.equal(days.length, 30);
  assert.equal(days.at(-1).date, "2026-11-23");
  assert.equal(
    days.reduce((s, d) => s + d.total, 0),
    2,
  );
  assert.equal(days.at(-1).done, 1);
});
test("the timeline groups multiple doses but respects the actual selected day and archived records", () => {
  const tasks = [
    item("a", "2026-10-25"),
    item("b", "2026-10-25", "20:00"),
    item("c", "2026-10-26"),
    item("d", "2026-10-25", "10:00", "todo", { archived: true }),
  ];
  const groups = timelineGroups(tasks, "2026-10-25");
  assert.equal(groups.length, 1);
  assert.equal(groups[0].slots.length, 2);
  assert.ok(Math.abs(groups[0].slots[0].percent - 33.333333) < 0.001);
});
test("caregiver workload includes completion rate, active days, and unassigned tasks", () => {
  const loads = caregiverLoads(
    [
      { id: "lan", name: "Lan" },
      { id: "gone", name: "Former", archived: true },
    ],
    [
      item("a", "2026-10-25", "08:00", "done", { who: "lan" }),
      item("b", "2026-10-26", "08:00", "todo", { who: "lan" }),
      item("c", "2026-10-25"),
    ],
  );
  assert.equal(loads[0].total, 2);
  assert.equal(loads[0].rate, 50);
  assert.equal(loads[0].activeDays, 1);
  assert.equal(loads.at(-1).total, 1);
  assert.equal(loads.length, 2);
});
test("the timing-conflict example cannot mutate the actual plan or compiled times", () => {
  const plan = {
    meds: [
      { id: "a", drug: "A", gapTarget: "B", gapHours: 2 },
      { id: "b", drug: "B" },
    ],
    compiled: { times: { a: ["10:00"], b: ["08:00"] } },
  };
  const copy = structuredClone(plan);
  const example = conflictExample(plan);
  assert.equal(example.time, "08:00");
  assert.equal(example.requiredHours, 2);
  assert.deepEqual(plan, copy);
  assert.equal(
    conflictExample({ ...plan, meds: [{ id: "a", drug: "A" }] }),
    null,
  );
});
test("the calendar has weekday offsets, leap days, and task counts", () => {
  const month = calendarMonth("2028-02", [item("a", "2028-02-29")]);
  assert.equal(month.days.length, 29);
  assert.equal(month.offset, 2);
  assert.equal(month.days.at(-1).total, 1);
  assert.throws(() => calendarMonth("2028-99", []));
});
