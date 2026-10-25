// Deterministic scheduling of entered instructions. No dose or prescription edits.
export const DEFAULT_MEALS = Object.freeze({
  breakfast: "08:00",
  lunch: "12:00",
  dinner: "18:00",
});
export const FREQUENCIES = Object.freeze([
  "once daily",
  "twice daily",
  "three times daily",
  "every 8 hours",
  "every 6 hours",
  "every 12 hours",
  "at bedtime",
  "in the morning",
]);
const minuteOf = (value) =>
  /^\d{2}:\d{2}$/.test(value || "") &&
  Number(value.slice(0, 2)) < 24 &&
  Number(value.slice(3)) < 60
    ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3))
    : NaN;
const asClock = (value) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const circularDistance = (a, b) =>
  Math.min(Math.abs(a - b), 1440 - Math.abs(a - b));
export function preferredTimes(med) {
  const freq = med.freq;
  if (freq === "at bedtime") return ["22:00"];
  if (freq === "every 8 hours") return ["06:00", "14:00", "22:00"];
  if (freq === "every 6 hours") return ["00:00", "06:00", "12:00", "18:00"];
  if (freq === "every 12 hours" || freq === "twice daily")
    return ["08:00", "20:00"];
  if (freq === "three times daily") return ["08:00", "14:00", "20:00"];
  return ["08:00"];
}
function buildOptions(med, meals) {
  const mealPoints = Object.entries(meals)
    .filter(
      ([name]) =>
        !med.mealTarget || med.mealTarget === "any" || med.mealTarget === name,
    )
    .map(([, t]) => minuteOf(t));
  const mealFits = (t) =>
    med.meal === "any" ||
    mealPoints.some((m) =>
      med.meal === "with"
        ? circularDistance(t, m) <= 30
        : med.meal === "before"
          ? (m - t + 1440) % 1440 >= 15 && (m - t + 1440) % 1440 <= 60
          : (t - m + 1440) % 1440 >= 15 && (t - m + 1440) % 1440 <= 60,
    );
  const baseline = preferredTimes(med).map(minuteOf);
  if (med.freq === "in the morning" || med.freq === "at bedtime")
    return baseline.every(mealFits) ? [baseline] : [];
  const exact = med.freq.match(/^every (\d+) hours$/);
  const options = [];
  if (exact) {
    const step = Number(exact[1]) * 60;
    for (let start = 0; start < step; start += 15) {
      const times = Array.from(
        { length: 1440 / step },
        (_, i) => start + i * step,
      );
      if (times.every(mealFits)) options.push(times);
    }
  } else {
    const count = baseline.length;
    const grid = Array.from({ length: 57 }, (_, i) => 420 + i * 15).filter(
      mealFits,
    );
    function choose(start, times) {
      if (times.length === count) {
        options.push(times);
        return;
      }
      for (let i = start; i < grid.length; i++) {
        if (times.length && grid[i] - times.at(-1) < 240) continue;
        choose(i + 1, [...times, grid[i]]);
      }
    }
    choose(0, []);
  }
  const score = (times) =>
    times.reduce((sum, t, i) => sum + circularDistance(t, baseline[i]), 0);
  return options.sort((a, b) => score(a) - score(b));
}
export function spacingRules(meds) {
  const rules = new Map();
  for (const med of meds) {
    if (!Number(med.gapH)) continue;
    for (const other of meds) {
      if (med.id === other.id) continue;
      if (
        med.gapTarget &&
        med.gapTarget.toLowerCase() !== other.drug.toLowerCase()
      )
        continue;
      const key = [med.id, other.id].sort().join(":");
      const previous = rules.get(key);
      if (!previous || previous.hours < Number(med.gapH))
        rules.set(key, {
          a: med.id,
          b: other.id,
          aName: med.drug,
          bName: other.drug,
          hours: Number(med.gapH),
        });
    }
  }
  return [...rules.values()];
}
export function checkTimes(meds, times, meals = DEFAULT_MEALS) {
  const violations = [];
  for (const med of meds) {
    const actual = (times[med.id] || []).map(minuteOf).sort((a, b) => a - b);
    const validGroups = buildOptions(med, meals);
    if (
      !validGroups.some(
        (group) =>
          group.length === actual.length &&
          group.every((t, i) => t === actual[i]),
      )
    )
      violations.push({
        medId: med.id,
        msg: `${med.drug}: these times do not fit the entered frequency and food rule.`,
      });
  }
  for (const rule of spacingRules(meds)) {
    if (
      (times[rule.a] || []).some((a) =>
        (times[rule.b] || []).some(
          (b) => circularDistance(minuteOf(a), minuteOf(b)) < rule.hours * 60,
        ),
      )
    )
      violations.push({
        medId: rule.a,
        pair: [rule.aName, rule.bName],
        msg: `${rule.aName} and ${rule.bName} need at least ${rule.hours} hours apart.`,
      });
  }
  return violations;
}
export function autoResolve(
  meds,
  meals = DEFAULT_MEALS,
  requestedTimes = {},
  config = {},
) {
  const issues = [];
  const fail = (messages, limited = false) => ({
    ok: false,
    times: {},
    adjustments: [],
    violations: messages.map((msg) => ({ msg })),
    bad: {},
    limited,
  });
  if (!Array.isArray(meds) || !meds.length || meds.length > 15)
    return fail(["Enter between 1 and 15 medications."]);
  if (
    Object.keys(DEFAULT_MEALS).some(
      (key) => !Number.isFinite(minuteOf(meals[key])),
    )
  )
    return fail(["Enter valid breakfast, lunch and dinner times."]);
  const ids = new Set(),
    names = new Set();
  for (const med of meds) {
    const name = String(med.drug || "")
      .trim()
      .toLowerCase();
    if (!med.id || ids.has(med.id) || !name || names.has(name))
      issues.push("Each medication needs a unique name and ID.");
    ids.add(med.id);
    names.add(name);
    if (!String(med.dose || "").trim())
      issues.push(
        `${med.drug || "Medication"}: enter the dose from the instructions.`,
      );
    if (!FREQUENCIES.includes(med.freq))
      issues.push(
        `${med.drug}: choose a supported frequency from the instructions.`,
      );
    if (!["any", "with", "before", "after"].includes(med.meal))
      issues.push(`${med.drug}: review its food rule.`);
    if (
      med.mealTarget &&
      !["any", ...Object.keys(DEFAULT_MEALS)].includes(med.mealTarget)
    )
      issues.push(`${med.drug}: review the selected meal.`);
    if (
      med.gapH != null &&
      med.gapH !== "" &&
      (!Number.isFinite(Number(med.gapH)) ||
        Number(med.gapH) < 0 ||
        Number(med.gapH) > 24)
    )
      issues.push(`${med.drug}: enter a spacing value between 0 and 24 hours.`);
    if (
      med.gapTarget &&
      (!Number(med.gapH) ||
        med.gapTarget.toLowerCase() === name ||
        !meds.some(
          (other) => other.drug.toLowerCase() === med.gapTarget.toLowerCase(),
        ))
    )
      issues.push(
        `${med.drug}: check the named medication and gap in the original instructions.`,
      );
  }
  if (issues.length) return fail([...new Set(issues)]);
  const rules = spacingRules(meds);
  const groups = meds
    .map((med) => ({ med, options: buildOptions(med, meals) }))
    .sort((a, b) => a.options.length - b.options.length);
  for (const group of groups) {
    // Prefer the currently requested schedule, then the least disruptive alternatives.
    const wanted = requestedTimes[group.med.id];
    if (wanted) {
      const index = group.options.findIndex(
        (option) =>
          option.map(asClock).join(",") === [...wanted].sort().join(","),
      );
      if (index > 0) group.options.unshift(...group.options.splice(index, 1));
    }
    if (!group.options.length)
      issues.push(
        `${group.med.drug}: its frequency and food rule cannot fit the meal times. Check the original instruction and meal times.`,
      );
  }
  if (issues.length) return fail(issues);
  const placed = {};
  const budget = config.searchLimit ?? 150000;
  let visits = 0,
    limited = false;
  function search(index) {
    if (index === groups.length) return true;
    if (++visits > budget) {
      limited = true;
      return false;
    }
    const { med, options } = groups[index];
    for (const option of options) {
      if (++visits > budget) {
        limited = true;
        return false;
      }
      const fits = rules.every((rule) => {
        const other =
          rule.a === med.id ? rule.b : rule.b === med.id ? rule.a : null;
        return (
          !other ||
          !placed[other] ||
          option.every((t) =>
            placed[other].every(
              (x) => circularDistance(t, x) >= rule.hours * 60,
            ),
          )
        );
      });
      if (fits) {
        placed[med.id] = option;
        if (search(index + 1)) return true;
        delete placed[med.id];
      }
      if (limited) return false;
    }
    return false;
  }
  if (!search(0))
    return fail(
      limited
        ? [
            "Automatic search reached its limit. No new schedule was saved. Review these instructions with the care team.",
          ]
        : [
            "No schedule was found with the current timing settings. Check the original spacing, frequency and meal instructions; ask the care team to clarify if they are correct.",
            ...rules.map(
              (rule) =>
                `${rule.aName} / ${rule.bName}: at least ${rule.hours} hours apart.`,
            ),
          ],
      limited,
    );
  const times = Object.fromEntries(
    Object.entries(placed).map(([id, values]) => [id, values.map(asClock)]),
  );
  const adjustments = [];
  for (const med of meds) {
    const before = requestedTimes[med.id] || preferredTimes(med);
    if ([...before].sort().join(",") === times[med.id].join(",")) continue;
    const reasons = [];
    if (med.meal !== "any")
      reasons.push(
        `${med.meal === "with" ? "with" : med.meal} ${med.mealTarget && med.mealTarget !== "any" ? med.mealTarget : "food"}`,
      );
    for (const rule of rules.filter((r) => r.a === med.id || r.b === med.id))
      reasons.push(
        `at least ${rule.hours} hours from ${rule.a === med.id ? rule.bName : rule.aName}`,
      );
    if (/^every /.test(med.freq)) reasons.push(`${med.freq} preserved`);
    adjustments.push({
      medId: med.id,
      drug: med.drug,
      before: [...before],
      after: times[med.id],
      reason: reasons.join("; ") || "fits the other entered timing rules",
    });
  }
  return {
    ok: true,
    times,
    adjustments,
    violations: [],
    bad: {},
    rules,
    meals: { ...meals },
  };
}
