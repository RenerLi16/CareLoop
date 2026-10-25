import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInstructions } from "../src/instructions.js";
import { autoResolve } from "../src/scheduler.js";
const read = (line) => parseInstructions("MEDICATIONS\n" + line, "2026-10-25");
test("once daily at bedtime retains bedtime instead of silently choosing morning", () => {
  const m = read("Alpha 10 mg once daily at bedtime").meds[0];
  assert.equal(m.freq, "at bedtime");
  assert.equal(m.issue, "");
  assert.deepEqual(autoResolve([m]).times[m.id], ["22:00"]);
});
test("a compatible exact interval takes precedence over generic daily frequency", () => {
  const m = read("Alpha 10 mg twice daily every 12 hours with food").meds[0];
  assert.equal(m.freq, "every 12 hours");
  assert.equal(m.issue, "");
  assert.equal(
    autoResolve([m]).ok,
    false,
    "Must not relax 12-hour spacing to fit meals",
  );
});
test("contradictory timing phrases require explicit review and a frequency choice", () => {
  for (const line of [
    "Alpha 10 mg once daily every 8 hours",
    "Alpha 10 mg twice daily at bedtime",
    "Alpha 10 mg in the morning at bedtime",
  ]) {
    const m = read(line).meds[0];
    assert.equal(m.freq, "");
    assert.match(m.issue, /conflict/);
    assert.equal(autoResolve([m]).ok, false);
  }
});
test("named spacing retains the named target and decimal gap", () => {
  const m = read(
    "Alpha 10 mg once daily, at least 2.5 hours apart from Drug Beta",
  ).meds[0];
  assert.equal(m.gapH, 2.5);
  assert.equal(m.gapTarget, "Drug Beta");
  assert.equal(m.issue, "");
});
test("specific meals remain specific and incompatible food rules need review", () => {
  assert.equal(
    read("Alpha 10 mg once daily after lunch").meds[0].mealTarget,
    "lunch",
  );
  assert.match(
    read("Alpha 10 mg once daily with food before breakfast").meds[0].issue,
    /food rules/,
  );
});
test("generic providers and zero-day followups are read; unsupported wording is never silently dropped", () => {
  const p = parseInstructions(
    "FOLLOW UP\nOncology in 5 days\nPhysical therapy in 0 days\nSee cardiology next Tuesday\nMONITORING\nDaily weight",
  );
  assert.equal(p.followups.length, 2);
  assert.equal(p.followups[1].days, 0);
  assert.deepEqual(p.unread, [
    "Follow-up: See cardiology next Tuesday",
    "Monitoring: Daily weight",
  ]);
});
test("all warning text survives, including short warnings and more than six lines", () => {
  const p = parseInstructions(
    "CALL THE DOCTOR IF\n" +
      Array.from({ length: 9 }, (_, i) => "Flag " + i).join("\n") +
      "\nGO TO EMERGENCY IF\nHELP",
  );
  assert.equal(p.flags.length, 10);
  assert.equal(p.flags.at(-1), "HELP");
});
test("no sample medicines or frequencies are invented for unreadable instructions", () => {
  const p = read("unknown tablet");
  assert.equal(p.meds.length, 0);
  assert.deepEqual(p.unread, ["unknown tablet"]);
  const m = read("Alpha 10 mg as needed").meds[0];
  assert.equal(m.freq, "");
  assert.match(m.issue, /as needed/);
});
