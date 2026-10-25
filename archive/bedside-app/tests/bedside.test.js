import { test } from "node:test";
import assert from "node:assert/strict";
import { bedsideDay } from "../src/bedside.js";
const task = (id, date, time, status = "todo", archived = false) => ({
  id,
  date,
  dueAt: `${date}T${time}:00.000Z`,
  status,
  archived,
});
const now = Date.parse("2026-10-25T12:00:00.000Z");
test("the next bedside task is the earliest pending task today, even when input is unordered", () => {
  const tasks = [
    task("later", "2026-10-25", "18:00"),
    task("tomorrow", "2026-10-26", "08:00"),
    task("earlier", "2026-10-25", "08:00"),
    task("done", "2026-10-25", "07:00", "done"),
  ];
  const day = bedsideDay(tasks, "2026-10-25", now);
  assert.equal(day.next.id, "earlier");
  assert.deepEqual(
    day.pending.map((t) => t.id),
    ["earlier", "later"],
  );
  assert.equal(tasks[0].id, "later");
});
test("past dates and archived tasks cannot appear in today’s counts or focus card", () => {
  const day = bedsideDay(
    [
      task("old", "2026-10-24", "08:00"),
      task("archived", "2026-10-25", "07:00", "todo", true),
      task("done", "2026-10-25", "08:00", "done"),
      task("skip", "2026-10-25", "09:00", "skipped"),
    ],
    "2026-10-25",
    now,
  );
  assert.equal(day.today.length, 2);
  assert.equal(day.pending.length, 0);
  assert.equal(day.completed.length, 1);
  assert.equal(day.skipped.length, 1);
  assert.equal(day.recorded.length, 2);
  assert.equal(day.next, null);
  assert.equal(day.earlier[0].id, "old");
});
test("an empty day does not borrow tomorrow’s tasks or claim tomorrow is complete", () => {
  const day = bedsideDay(
    [task("next-day", "2026-10-26", "08:00")],
    "2026-10-25",
    now,
  );
  assert.equal(day.next, null);
  assert.equal(day.today.length, 0);
});
test("past-due state is calculated at the current instant using the existing one-hour window", () => {
  const day = bedsideDay(
    [
      task("late", "2026-10-25", "10:59"),
      task("boundary", "2026-10-25", "11:00"),
      task("upcoming", "2026-10-25", "13:00"),
    ],
    "2026-10-25",
    now,
  );
  assert.deepEqual(
    day.pastDue.map((t) => t.id),
    ["late"],
  );
});
test("the bedside view follows the patient-local date supplied across midnight", () => {
  const tasks = [
    task("yesterday", "2026-10-25", "23:00"),
    task("today", "2026-10-26", "08:00"),
  ];
  const day = bedsideDay(
    tasks,
    "2026-10-26",
    Date.parse("2026-10-26T00:05:00Z"),
  );
  assert.equal(day.next.id, "today");
  assert.equal(day.earlier[0].id, "yesterday");
});
