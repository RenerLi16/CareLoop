import { addDays, minutes, spacingRules } from "./domain.js";
export function planDays(plan, tasks) {
  if (!plan) return [];
  const active = tasks.filter((task) => !task.archived);
  return Array.from({ length: 30 }, (_, index) => {
    const date = addDays(plan.startDate, index),
      items = active
        .filter((task) => task.date === date)
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return {
      date,
      index: index + 1,
      tasks: items,
      total: items.length,
      done: items.filter((t) => t.status === "done").length,
      skipped: items.filter((t) => t.status === "skipped").length,
      pending: items.filter((t) => t.status === "todo").length,
    };
  });
}
export function timelineGroups(tasks, date) {
  const groups = new Map();
  for (const task of tasks
    .filter((t) => !t.archived && t.date === date)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
    const key =
      task.medId || task.kind + (task.kind === "visit" ? task.id : "");
    if (!groups.has(key))
      groups.set(key, {
        id: key,
        label: task.label,
        kind: task.kind,
        slots: [],
      });
    groups.get(key).slots.push({
      time: task.time,
      percent: (minutes(task.time) / 1440) * 100,
      status: task.status,
      id: task.id,
    });
  }
  return [...groups.values()];
}
export function caregiverLoads(team, tasks) {
  const active = tasks.filter((t) => !t.archived);
  return [
    ...team
      .filter((person) => !person.archived)
      .map((person) => ({
        ...person,
        tasks: active.filter((t) => t.who === person.id),
      })),
    { id: "", name: "Unassigned", tasks: active.filter((t) => !t.who) },
  ].map((person) => {
    const done = person.tasks.filter((t) => t.status === "done");
    return {
      ...person,
      total: person.tasks.length,
      done: done.length,
      rate: person.tasks.length
        ? Math.round((done.length / person.tasks.length) * 100)
        : 0,
      activeDays: new Set(done.map((t) => t.date)).size,
    };
  });
}
export function conflictExample(plan) {
  if (!plan) return null;
  const rule = spacingRules(plan.meds)[0];
  if (!rule) return null;
  const a = plan.meds.find((m) => m.id === rule.a),
    b = plan.meds.find((m) => m.id === rule.b);
  const time = plan.compiled.times[b.id]?.[0];
  if (!time) return null;
  return {
    a: a.drug,
    b: b.drug,
    time,
    requiredHours: rule.hours,
    message: `${a.drug} and ${b.drug} at ${time} are 0 hours apart. The entered rule requires at least ${rule.hours} hours.`,
  };
}
export function calendarMonth(month, tasks) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error("Choose a valid month.");
  const first = month + "-01",
    start = new Date(first + "T12:00:00Z"),
    length = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
    ).getUTCDate();
  return {
    offset: start.getUTCDay(),
    days: Array.from({ length }, (_, i) => {
      const date = addDays(first, i),
        items = tasks.filter((t) => !t.archived && t.date === date);
      return {
        date,
        number: i + 1,
        total: items.length,
        pending: items.filter((t) => t.status === "todo").length,
      };
    }),
  };
}
