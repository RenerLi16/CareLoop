import { spacingRules } from "./scheduler.js";

export const taskDue = (task) =>
  task.dueAt ?? new Date(`${task.date}T${task.time}:00`).getTime();
const liveDay = (value) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const liveClock = (value) => {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

export function fitsMedicineTime(med, instant, meals) {
  const time =
    new Date(instant).getHours() * 60 + new Date(instant).getMinutes();
  if (med.freq === "in the morning" && Math.abs(time - 480) > 5) return false;
  if (med.freq === "at bedtime" && Math.abs(time - 1320) > 5) return false;
  if (med.meal === "any") return true;
  return Object.entries(meals).some(([name, clock]) => {
    if (med.mealTarget && med.mealTarget !== "any" && med.mealTarget !== name)
      return false;
    const [hours, minutes] = clock.split(":").map(Number);
    const delta = (time - hours * 60 - minutes + 1440) % 1440;
    return med.meal === "with"
      ? Math.min(delta, 1440 - delta) <= 30
      : med.meal === "before"
        ? delta >= 1380 && delta <= 1425
        : delta >= 15 && delta <= 60;
  });
}

export function timingStatus(state, task, instant = Date.now()) {
  const due = taskDue(task);
  const med = state.meds.find((item) => item.id === task.medId);
  const reasons = [];
  if (Math.abs(instant - due) > 5 * 60000)
    reasons.push(
      "Outside the target window (5 minutes before or after the scheduled time).",
    );
  if (med && !fitsMedicineTime(med, instant, state.meals))
    reasons.push(
      "The actual time does not fit the entered food or fixed-time instruction.",
    );
  if (med) {
    const rules = spacingRules(state.meds);
    const own = [...state.tasks, ...(state.history || [])]
      .filter((item) => item.kind === "med" && item.medId === task.medId)
      .sort((a, b) => taskDue(a) - taskDue(b) || a.id.localeCompare(b.id));
    const exact = med.freq.match(/^every (\d+) hours$/);
    for (const other of [...state.tasks, ...(state.history || [])]) {
      if (
        other.id === task.id ||
        other.kind !== "med" ||
        other.status !== "done" ||
        other.doneAt == null
      )
        continue;
      if (exact && other.medId === task.medId) {
        const distance =
          own.findIndex((item) => item.id === task.id) -
          own.findIndex((item) => item.id === other.id);
        if (instant - other.doneAt !== distance * Number(exact[1]) * 3600000)
          reasons.push(
            `The actual time does not preserve the entered ${exact[1]}-hour interval from the recorded dose.`,
          );
      }
      const rule = rules.find(
        (item) =>
          (item.a === med.id && item.b === other.medId) ||
          (item.b === med.id && item.a === other.medId),
      );
      if (rule && Math.abs(instant - other.doneAt) < rule.hours * 3600000)
        reasons.push(
          `The entered ${rule.hours}-hour spacing from ${other.label} is not met.`,
        );
    }
  }
  return {
    phase:
      instant < due - 300000
        ? "upcoming"
        : instant > due + 300000
          ? "overdue"
          : "due",
    fits: reasons.length === 0,
    reasons: [...new Set(reasons)],
  };
}

export function homeQueue(state, now = Date.now()) {
  const pending = state.tasks
    .filter((task) => task.status === "todo")
    .sort((a, b) => taskDue(a) - taskDue(b) || a.id.localeCompare(b.id));
  return {
    overdue: pending.filter((task) => taskDue(task) < now),
    next: pending.find((task) => taskDue(task) >= now) || null,
  };
}

// Completed doses are immutable anchors. Search only pending dated doses, keeping
// their count, identity, day, entered food rules, spacing and exact intervals.
export function resolveRemaining(state, now = Date.now(), searchLimit = 40000) {
  const result = structuredClone(state);
  const today = liveDay(now);
  const meds = new Map(state.meds.map((med) => [med.id, med]));
  const rules = spacingRules(state.meds);
  const all = [...state.tasks, ...(state.history || [])]
    .filter((task) => task.kind === "med" && meds.has(task.medId))
    .sort((a, b) => taskDue(a) - taskDue(b) || a.id.localeCompare(b.id));
  const order = new Map();
  for (const med of state.meds)
    all
      .filter((task) => task.medId === med.id)
      .forEach((task, index) => order.set(task.id, index));
  const anchors = all
    .filter((task) => task.status === "done" && task.doneAt != null)
    .map((task) => ({ task, at: task.doneAt }));
  const pending = result.tasks
    .filter(
      (task) =>
        task.kind === "med" && task.status === "todo" && task.date >= today,
    )
    .sort((a, b) => taskDue(a) - taskDue(b) || a.id.localeCompare(b.id));
  const placed = [...anchors];
  let visits = 0;
  const fits = (task, at) => {
    const med = meds.get(task.medId);
    if (
      !med ||
      at < now ||
      liveDay(at) !== task.date ||
      !fitsMedicineTime(med, at, state.meals)
    )
      return false;
    const exact = med.freq.match(/^every (\d+) hours$/);
    for (const entry of placed) {
      if (entry.task.medId === task.medId) {
        const distance = order.get(task.id) - order.get(entry.task.id);
        if (!distance || Math.sign(at - entry.at) !== Math.sign(distance))
          return false;
        if (
          exact &&
          Math.abs(at - entry.at - distance * Number(exact[1]) * 3600000) > 1
        )
          return false;
        if (
          !exact &&
          task.date === entry.task.date &&
          Math.abs(at - entry.at) <
            (med.freq === "once daily" ? 0 : 4 * 3600000)
        )
          return false;
      }
      const rule = rules.find(
        (item) =>
          (item.a === task.medId && item.b === entry.task.medId) ||
          (item.b === task.medId && item.a === entry.task.medId),
      );
      if (rule && Math.abs(at - entry.at) < rule.hours * 3600000) return false;
    }
    return true;
  };
  function search(index) {
    if (index === pending.length) return true;
    const task = pending[index],
      med = meds.get(task.medId);
    if (!med) return false;
    const exact = med.freq.match(/^every (\d+) hours$/);
    const anchor =
      exact && placed.find((entry) => entry.task.medId === task.medId);
    const start = new Date(`${task.date}T00:00:00`).getTime();
    const end = new Date(`${task.date}T23:59:59`).getTime();
    let options;
    if (anchor)
      options = [
        anchor.at +
          (order.get(task.id) - order.get(anchor.task.id)) *
            Number(exact[1]) *
            3600000,
      ];
    else {
      options = [taskDue(task)];
      for (const entry of placed) {
        const rule = rules.find(
          (item) =>
            (item.a === task.medId && item.b === entry.task.medId) ||
            (item.b === task.medId && item.a === entry.task.medId),
        );
        if (rule)
          options.push(
            entry.at - rule.hours * 3600000,
            entry.at + rule.hours * 3600000,
          );
      }
      // Enumerate real instants so repeated/nonexistent clock hours are handled.
      for (
        let at = Math.max(start, Math.ceil(now / 300000) * 300000);
        at <= end;
        at += 300000
      )
        options.push(at);
      options = [...new Set(options)].sort(
        (a, b) =>
          Math.abs(a - taskDue(task)) - Math.abs(b - taskDue(task)) || a - b,
      );
    }
    for (const at of options) {
      if (++visits > searchLimit) return false;
      if (!fits(task, at)) continue;
      placed.push({ task, at });
      if (search(index + 1)) {
        task.dueAt = at;
        task.time = liveClock(at);
        return true;
      }
      placed.pop();
    }
    return false;
  }
  if (!search(0))
    return {
      ok: false,
      message:
        "No revised schedule was found within the entered rules and remaining days. The completed record is saved. Ask the care team to review the timing.",
      limited: visits > searchLimit,
    };
  result.tasks.sort(
    (a, b) => taskDue(a) - taskDue(b) || a.id.localeCompare(b.id),
  );
  const adjustments = pending
    .filter(
      (task) =>
        taskDue(state.tasks.find((old) => old.id === task.id)) !==
        taskDue(task),
    )
    .map((task) => ({
      id: task.id,
      label: task.label,
      date: task.date,
      before: state.tasks.find((old) => old.id === task.id).time,
      after: task.time,
    }));
  if (adjustments.length)
    result.audit = [
      ...(result.audit || []),
      {
        at: now,
        action: "resolve",
        by: "Automatic schedule resolution",
        adjustments,
      },
    ].slice(-10000);
  return { ok: true, state: result, adjustments };
}
