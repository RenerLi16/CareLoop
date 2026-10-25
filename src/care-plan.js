import { spacingRules } from "./scheduler.js";
const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const clockKey = (d) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const at = (date, time) => new Date(date + "T" + time + ":00").getTime();
const numericTime = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const dayDistance = (a, b) => Math.min(Math.abs(a - b), 1440 - Math.abs(a - b));
export function generatePlanTasks(state, days = 30) {
  if (!state.patient || !state.schedule?.ok) return [];
  const start = new Date(state.patient.dischargeDate + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  const team = state.team.length
    ? state.team
    : [{ id: "t1", name: "Me", rel: "self" }];
  const tasks = [];
  for (const [mi, med] of state.meds.entries()) {
    const slots = state.schedule.times[med.id] || [],
      exact = med.freq.match(/^every (\d+) hours$/);
    const instants = [];
    if (exact && slots.length) {
      // Real elapsed hours, rather than repeating wall-clock times through DST.
      for (
        let due = at(dateKey(start), slots[0]);
        due < end.getTime();
        due += Number(exact[1]) * 3600000
      )
        instants.push(due);
    } else {
      for (let d = 0; d < days; d++) {
        const date = new Date(start);
        date.setDate(date.getDate() + d);
        for (const time of slots) instants.push(at(dateKey(date), time));
      }
    }
    const indices = new Map();
    for (const dueAt of instants) {
      const date = new Date(dueAt),
        key = dateKey(date),
        index = indices.get(key) || 0;
      indices.set(key, index + 1);
      const dayIndex = Math.round(
        (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
          Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) /
          86400000,
      );
      tasks.push({
        id: `${key}-${med.id}-${index}`,
        date: key,
        time: clockKey(date),
        dueAt,
        kind: "med",
        label: `${med.drug} ${med.dose}`,
        medId: med.id,
        who: team[(dayIndex + mi + index) % team.length].id,
        status: "todo",
        doneAt: null,
      });
    }
  }
  for (let d = 0; d < days; d++) {
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    const key = dateKey(date);
    if (state.weigh)
      tasks.push({
        id: key + "-w",
        date: key,
        time: "08:30",
        dueAt: at(key, "08:30"),
        kind: "weight",
        label: "Morning weight",
        who: team[d % team.length].id,
        status: "todo",
        doneAt: null,
      });
    if (state.symptoms)
      tasks.push({
        id: key + "-s",
        date: key,
        time: "19:00",
        dueAt: at(key, "19:00"),
        kind: "symptom",
        label: "Daily symptom check",
        who: team[(d + 1) % team.length].id,
        status: "todo",
        doneAt: null,
      });
  }
  for (const followup of state.followups || []) {
    const date = new Date(start);
    date.setDate(date.getDate() + Number(followup.days ?? 7));
    const key = dateKey(date);
    tasks.push({
      id: "fu-" + followup.id,
      date: key,
      time: "09:00",
      dueAt: at(key, "09:00"),
      kind: "visit",
      label: `Book ${followup.who} follow-up`,
      who: team[0].id,
      status: "todo",
      doneAt: null,
    });
  }
  return tasks.sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id));
}
export function validateDatedTasks(plan, tasks) {
  const errors = [],
    meds = new Map(plan.meds.map((m) => [m.id, m]));
  const doses = tasks
    .filter((t) => t.kind === "med")
    .map((t) => ({ ...t, dueAt: t.dueAt ?? at(t.date, t.time) }))
    .sort((a, b) => a.dueAt - b.dueAt);
  const rules = spacingRules(plan.meds);
  for (const med of plan.meds) {
    const exact = med.freq.match(/^every (\d+) hours$/);
    if (!exact) continue;
    const own = doses.filter((task) => task.medId === med.id);
    for (let i = 1; i < own.length; i++)
      if (own[i].dueAt - own[i - 1].dueAt !== Number(exact[1]) * 3600000) {
        errors.push(
          `${own[i].date}: ${med.drug} would no longer have its entered ${exact[1]}-hour interval. The saved records and timetable need review before replacing the plan.`,
        );
        break;
      }
  }

  for (const task of doses) {
    const med = meds.get(task.medId);
    if (!med || med.meal === "any") continue;
    const meals = Object.entries(plan.meals)
      .filter(
        ([key]) =>
          !med.mealTarget || med.mealTarget === "any" || med.mealTarget === key,
      )
      .map(([, time]) => numericTime(time));
    const time = numericTime(task.time);
    const fits = meals.some((meal) =>
      med.meal === "with"
        ? dayDistance(time, meal) <= 30
        : med.meal === "before"
          ? (meal - time + 1440) % 1440 >= 15 &&
            (meal - time + 1440) % 1440 <= 60
          : (time - meal + 1440) % 1440 >= 15 &&
            (time - meal + 1440) % 1440 <= 60,
    );
    if (!fits)
      errors.push(
        `${task.date}: ${med.drug} at ${task.time} does not fit its food instruction after the clock change. Review the meal times and original instructions with the care team.`,
      );
  }
  const maxHours = Math.max(0, ...rules.map((r) => r.hours));
  for (let i = 0; i < doses.length; i++)
    for (let j = i + 1; j < doses.length; j++) {
      const a = doses[i],
        b = doses[j],
        hours = (b.dueAt - a.dueAt) / 3600000;
      if (hours >= maxHours) break;
      const rule = rules.find(
        (r) =>
          (r.a === a.medId && r.b === b.medId) ||
          (r.b === a.medId && r.a === b.medId),
      );
      if (rule && hours < rule.hours)
        errors.push(
          `${b.date}: ${rule.aName} and ${rule.bName} are ${hours.toFixed(2)} hours apart; the entered rule requires ${rule.hours}. No revised plan was saved. Review the instructions and timing settings.`,
        );
    }
  return [...new Set(errors)];
}
const timingSignature = (plan) =>
  JSON.stringify({
    meds: plan.meds
      .map((m) => ({
        id: m.id,
        drug: m.drug,
        dose: m.dose,
        freq: m.freq,
        meal: m.meal,
        mealTarget: m.mealTarget || "any",
        gapH: Number(m.gapH || 0),
        gapTarget: (m.gapTarget || "").toLowerCase(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    meals: plan.meals,
    times: plan.schedule?.times,
    start: plan.patient?.dischargeDate,
  });
export function preparePlanTasks(
  previous,
  candidate,
  today = dateKey(new Date()),
) {
  if (
    previous.tasks.some(
      (t) => t.kind === "med" && t.status === "done" && t.date === today,
    ) &&
    timingSignature(previous) !== timingSignature(candidate)
  ) {
    return {
      ok: false,
      errors: [
        "A medicine is already recorded today. Today's timetable cannot be changed automatically around a recorded dose. Keep the saved plan and ask the care team to confirm the revised instructions before replacing it.",
      ],
    };
  }
  const old = new Map(previous.tasks.map((t) => [t.id, t])),
    generated = generatePlanTasks(candidate);
  const tasks = generated.map((task) => {
    const prior = old.get(task.id);
    if (prior && prior.status !== "todo")
      return { ...prior, dueAt: prior.dueAt ?? at(prior.date, prior.time) };
    return prior ? { ...task, who: prior.who } : task;
  });
  const errors = validateDatedTasks(
    candidate,
    tasks.filter((t) => t.date >= today),
  );
  if (errors.length) return { ok: false, errors };
  const ids = new Set(tasks.map((t) => t.id));
  return {
    ok: true,
    tasks,
    history: [
      ...(previous.history || []),
      ...previous.tasks.filter((t) => t.status !== "todo" && !ids.has(t.id)),
    ],
  };
}
