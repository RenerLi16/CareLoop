import { test } from "node:test";
import assert from "node:assert/strict";
import { autoResolve, checkTimes, DEFAULT_MEALS } from "../src/scheduler.js";
const med = (id, extra = {}) => ({
  id,
  drug: id,
  dose: "10 mg",
  freq: "once daily",
  meal: "any",
  gapH: null,
  gapTarget: "",
  ...extra,
});
const minute = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const distance = (a, b) =>
  Math.min(
    Math.abs(minute(a) - minute(b)),
    1440 - Math.abs(minute(a) - minute(b)),
  );
test("automatically moves a named conflicting medication and explains why without changing input", () => {
  const meds = [
      med("A", { freq: "in the morning" }),
      med("B", { gapH: 2, gapTarget: "A" }),
      med("C", { freq: "in the morning" }),
    ],
    before = structuredClone(meds);
  const result = autoResolve(meds);
  assert.equal(result.ok, true);
  assert.deepEqual(result.times.A, ["08:00"]);
  assert.deepEqual(result.times.C, ["08:00"]);
  assert.deepEqual(result.times.B, ["10:00"]);
  assert.match(
    result.adjustments.find((a) => a.drug === "B").reason,
    /2 hours from A/,
  );
  assert.deepEqual(meds, before);
  assert.deepEqual(checkTimes(meds, result.times), []);
});
test("finds a compatible phase for two exact-interval groups", () => {
  const meds = [
    med("A", { freq: "every 12 hours", gapH: 2, gapTarget: "B" }),
    med("B", { freq: "every 8 hours" }),
  ];
  const result = autoResolve(meds);
  assert.equal(result.ok, true);
  assert.deepEqual(checkTimes(meds, result.times), []);
});
test("uses meal times and reports the adjusted dose times", () => {
  const meds = [med("A", { freq: "twice daily", meal: "with" })];
  const result = autoResolve(meds);
  assert.equal(result.ok, true);
  assert.equal(result.times.A.length, 2);
  assert.ok(
    result.times.A.every((t) =>
      Object.values(DEFAULT_MEALS).some((m) => distance(t, m) <= 30),
    ),
  );
  assert.match(result.adjustments[0].reason, /with food/);
});
test("a specific before-breakfast rule stays attached to breakfast", () => {
  const meds = [med("A", { meal: "before", mealTarget: "breakfast" })];
  const result = autoResolve(meds);
  assert.equal(result.ok, true);
  assert.ok(result.times.A.every((t) => minute(t) >= 420 && minute(t) <= 465));
});
for (const hours of [6, 8, 12])
  test(`preserves every-${hours}-hour intervals including across midnight`, () => {
    const meds = [
      med("A", { freq: `every ${hours} hours`, gapH: 1, gapTarget: "B" }),
      med("B", { freq: "in the morning" }),
    ];
    const result = autoResolve(meds);
    assert.equal(result.ok, true);
    const times = result.times.A.map(minute);
    assert.equal(times.length, 24 / hours);
    for (let i = 0; i < times.length; i++)
      assert.equal(
        (times[(i + 1) % times.length] - times[i] + 1440) % 1440,
        hours * 60,
      );
    assert.deepEqual(checkTimes(meds, result.times), []);
  });
test("keeps gaps across the midnight boundary", () => {
  const meds = [
    med("A", { freq: "at bedtime" }),
    med("B", { freq: "every 6 hours", gapH: 2, gapTarget: "A" }),
  ];
  const result = autoResolve(meds);
  assert.equal(result.ok, true);
  for (const time of result.times.B) assert.ok(distance(time, "22:00") >= 120);
});
test("does not return conflicting times when fixed instructions cannot fit", () => {
  const result = autoResolve([
    med("A", { freq: "in the morning" }),
    med("B", { freq: "in the morning", gapH: 2, gapTarget: "A" }),
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.times, {});
  assert.match(
    result.violations.map((v) => v.msg).join(" "),
    /care team|Check the original/,
  );
});
test("does not relax an impossible exact interval plus food combination", () => {
  const result = autoResolve([
    med("A", { freq: "every 6 hours", meal: "with" }),
  ]);
  assert.equal(result.ok, false);
  assert.match(result.violations[0].msg, /meal times/);
});
test("returns a search-limit result without claiming the rules are impossible", () => {
  const result = autoResolve([med("A")], DEFAULT_MEALS, {}, { searchLimit: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.limited, true);
  assert.match(result.violations[0].msg, /limit/);
});
test("blank spacing target means all other medicines but never the same medicine", () => {
  const meds = [med("A", { gapH: 2 }), med("B"), med("C")],
    result = autoResolve(meds);
  assert.equal(result.ok, true);
  for (const other of ["B", "C"])
    assert.ok(distance(result.times.A[0], result.times[other][0]) >= 120);
});
test("returns no adjustment when the requested times already fit", () => {
  const result = autoResolve([med("A")], DEFAULT_MEALS, { A: ["11:00"] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.times.A, ["11:00"]);
  assert.deepEqual(result.adjustments, []);
});
test("rejects unknown targets, unsupported frequencies, missing doses, invalid meals and duplicate identities", () => {
  for (const meds of [
    [med("A", { gapH: 2, gapTarget: "Missing" })],
    [med("A", { freq: "as needed" })],
    [med("A", { dose: "" })],
    [med("A"), med("A")],
    [med("A", { gapH: -1 })],
  ])
    assert.equal(autoResolve(meds).ok, false);
  assert.equal(
    autoResolve([med("A")], { ...DEFAULT_MEALS, breakfast: "99:00" }).ok,
    false,
  );
});
test("conflict checking is a non-mutating example and detects a broken requested interval", () => {
  const meds = [med("A", { freq: "every 12 hours" })],
    times = { A: ["08:00", "19:00"] },
    before = structuredClone(times);
  assert.ok(checkTimes(meds, times).length);
  assert.deepEqual(times, before);
});
