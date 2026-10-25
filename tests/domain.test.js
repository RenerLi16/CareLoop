import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDischarge,
  compilePlan,
  generateTasks,
  mergeTasks,
  reconcilePlan,
  DEFAULT_PREFS,
  logWarnings,
  zonedISO,
  toICS,
} from "../src/domain.js";
const med = (id, extra = {}) => ({
  id,
  drug: id,
  dose: "10 mg",
  freq: "once daily",
  meal: "any",
  gapTarget: "",
  gapHours: "",
  reviewed: true,
  ...extra,
});
const plan = (meds, extra = {}) => ({
  patient: "Fictional Person",
  startDate: "2026-10-24",
  timeZone: "America/Los_Angeles",
  meds,
  followups: [],
  flags: [],
  prefs: { ...DEFAULT_PREFS },
  monitoring: { weight: false, symptoms: false },
  ...extra,
});
const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
test("unreadable input never invents drugs or frequencies", () => {
  const p = parseDischarge("random paperwork");
  assert.deepEqual(p.meds, []);
  assert.ok(p.unresolved.length);
  const r = parseDischarge(
    "MEDICATIONS\nDrug A 10 mg as needed\nunknown tablet instruction",
  );
  assert.equal(r.meds[0].freq, "");
  assert.match(r.meds[0].issue, /Frequency/);
  assert.equal(r.unresolved.length, 1);
});
test("parses named pair and retains unsupported text and source", () => {
  const p = parseDischarge(
    "MEDICATIONS\nDrug A 10 mg once daily, at least 2 hours apart from Drug B\nDrug B 20 mg twice daily with food\nDrug C 5 mg once daily for 5 days",
  );
  assert.equal(p.meds[0].gapTarget, "Drug B");
  assert.equal(p.meds[0].gapHours, 2);
  assert.equal(p.meds[1].meal, "with");
  assert.match(p.meds[2].issue, /for 5 days/);
  assert.match(p.meds[0].source, /Drug B/);
});
test("unreviewed and unsupported rows block publication", () => {
  assert.equal(compilePlan(plan([med("A", { reviewed: false })])).ok, false);
  assert.equal(
    compilePlan(
      plan([med("A")], { unresolved: [{ text: "x", resolved: false }] }),
    ).ok,
    false,
  );
});
test("pair constraint does not spread to unrelated medication", () => {
  const p = plan([
    med("A", { freq: "in the morning" }),
    med("B", { gapTarget: "A", gapHours: 2 }),
    med("C", { freq: "in the morning" }),
  ]);
  const c = compilePlan(p);
  assert.equal(c.ok, true);
  assert.equal(c.times.C[0], "08:00");
  assert.ok(Math.abs(mins(c.times.B[0]) - 480) >= 120);
});
test("food rules actually constrain schedule", () => {
  for (const meal of ["with", "before", "after"]) {
    const c = compilePlan(plan([med("A", { meal, freq: "twice daily" })]));
    assert.ok(c.ok);
    for (const t of c.times.A) {
      const n = mins(t);
      assert.ok(
        [480, 720, 1080].some((x) =>
          meal === "with"
            ? Math.abs(n - x) <= 30
            : meal === "before"
              ? x - n >= 15 && x - n <= 60
              : n - x >= 15 && n - x <= 60,
        ),
      );
    }
  }
});
test("exact interval is preserved across midnight and after spacing adjustments", () => {
  const p = plan([
      med("A", { freq: "every 8 hours", gapTarget: "B", gapHours: 1 }),
      med("B", { freq: "in the morning" }),
    ]),
    c = compilePlan(p);
  assert.ok(c.ok);
  const times = c.times.A.map(mins).sort((a, b) => a - b);
  assert.equal(times.length, 3);
  for (let i = 0; i < 3; i++)
    assert.equal((times[(i + 1) % 3] - times[i] + 1440) % 1440, 480);
});
test("impossible food/exact timing and impossible pair stop publication", () => {
  assert.equal(
    compilePlan(plan([med("A", { freq: "every 6 hours", meal: "with" })])).ok,
    false,
  );
  const c = compilePlan(
    plan([
      med("A", { freq: "in the morning", gapTarget: "B", gapHours: 2 }),
      med("B", { freq: "in the morning" }),
    ]),
  );
  assert.equal(c.ok, false);
  assert.deepEqual(c.times, {});
});
test("unknown gap target and invalid date fail", () => {
  assert.equal(
    compilePlan(plan([med("A", { gapTarget: "Missing", gapHours: 2 })])).ok,
    false,
  );
  assert.equal(
    compilePlan(plan([med("A")], { startDate: "2026-02-31" })).ok,
    false,
  );
});
test("task generation respects duration and booking status", () => {
  const p = plan([med("A", { endDate: "2026-10-26" })], {
    followups: [
      { id: "f1", provider: "Clinic", days: 7, confirmed: false },
      {
        id: "f2",
        provider: "Doctor",
        days: 2,
        confirmed: true,
        date: "2026-10-29",
        time: "14:30",
      },
    ],
  });
  const t = generateTasks(p, compilePlan(p));
  assert.equal(t.filter((x) => x.kind === "med").length, 3);
  assert.match(t.find((x) => x.id === "followup:f1").label, /Book follow-up/);
  assert.equal(t.find((x) => x.id === "followup:f2").time, "14:30");
});
test("plan revision keeps completion history and assignments", () => {
  const p = plan([med("A")]);
  const tasks = generateTasks(p, compilePlan(p));
  tasks[0].status = "done";
  tasks[0].actualAt = tasks[0].dueAt;
  tasks[1].who = "caregiver";
  const changed = plan([med("A", { freq: "at bedtime" })]);
  const merged = mergeTasks(
    tasks,
    generateTasks(changed, compilePlan(changed)),
  );
  assert.equal(merged[0].actualAt, tasks[0].actualAt);
  assert.equal(merged.find((t) => t.id === tasks[1].id).who, "caregiver");
  assert.equal(merged.length, 30);
  const removed = mergeTasks(tasks, []);
  assert.equal(removed[0].status, "done");
  assert.equal(removed[1].archived, true);
});
test("logs use actual completion time and named pair only", () => {
  const p = plan([
    med("A", { gapTarget: "B", gapHours: 2 }),
    med("B"),
    med("C"),
  ]);
  const tasks = ["A", "B", "C"].map((m, i) => ({
    id: String(i),
    kind: "med",
    medId: m,
    status: "done",
    actualAt: `2026-10-24T1${i}:00:00.000Z`,
    label: m,
  }));
  const warnings = logWarnings(tasks, p);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /A \/ B/);
});
test("time zones handle DST and reject nonexistent times", () => {
  assert.equal(
    zonedISO("2026-10-24", "08:00", "America/Los_Angeles"),
    "2026-10-24T15:00:00.000Z",
  );
  assert.equal(
    zonedISO("2026-11-02", "08:00", "America/Los_Angeles"),
    "2026-11-02T16:00:00.000Z",
  );
  assert.throws(
    () => zonedISO("2026-03-08", "02:30", "America/Los_Angeles"),
    /does not exist/,
  );
});
test("calendar uses UTC, escapes text, has alarm, excludes completed tasks and folds UTF-8", () => {
  const ics = toICS([
    {
      id: "x",
      label: "例".repeat(80) + ", a;b",
      dueAt: "2026-10-24T15:00:00.000Z",
      status: "todo",
    },
    { id: "done", status: "done", dueAt: "2026-10-24T15:00:00.000Z" },
  ]);
  assert.match(ics, /DTSTART:20261024T150000Z/);
  assert.match(ics, /TRIGGER:-PT15M/);
  assert.match(ics, /\\,/);
  assert.doesNotMatch(ics, /UID:done/);
  assert.ok(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75));
});
test("a daylight-saving transition cannot silently change an exact dose interval", () => {
  const p = plan([med("A", { freq: "every 8 hours" })]);
  assert.throws(
    () => generateTasks(p, compilePlan(p)),
    /clock change breaks the exact/,
  );
});
test("a breakfast-specific instruction cannot be scheduled at a different meal", () => {
  const parsed = parseDischarge(
    "MEDICATIONS\nA 10 mg once daily before breakfast",
  );
  const m = { ...parsed.meds[0], reviewed: true };
  assert.equal(m.mealTarget, "breakfast");
  const c = compilePlan(plan([m]));
  assert.ok(c.ok);
  const t = mins(c.times[m.id][0]);
  assert.ok(t >= 420 && t <= 465);
});

test("reimporting the same medication preserves its identity and completed doses", () => {
  const previous = plan([med("original", { drug: "Example A" })]);
  const incoming = plan([
    med("new-import-id", { drug: "Example A", dose: "20 mg" }),
  ]);
  const revised = reconcilePlan(previous, incoming);
  assert.equal(revised.meds[0].id, "original");
  const old = generateTasks(previous, compilePlan(previous));
  old[0].status = "done";
  old[0].actualAt = old[0].dueAt;
  const merged = mergeTasks(old, generateTasks(revised, compilePlan(revised)));
  assert.equal(
    merged.filter((t) => t.date === previous.startDate && t.kind === "med")
      .length,
    1,
  );
  assert.equal(merged[0].label, "Example A · 10 mg");
});
