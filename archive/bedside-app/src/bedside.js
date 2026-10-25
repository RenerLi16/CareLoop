// A bedside view describes the selected patient's calendar day, without changing care data.
export function bedsideDay(tasks, date, now = Date.now()) {
  const active = tasks.filter((task) => !task.archived);
  const today = active
    .filter((task) => task.date === date)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const pending = today.filter((task) => task.status === "todo");
  const earlier = active
    .filter((task) => task.date < date && task.status === "todo")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return {
    today,
    pending,
    earlier,
    completed: today.filter((task) => task.status === "done"),
    skipped: today.filter((task) => task.status === "skipped"),
    recorded: today.filter((task) => task.status !== "todo"),
    next: pending[0] || null,
    pastDue: pending.filter((task) => Date.parse(task.dueAt) < now - 3600000),
  };
}
