import { autoResolve } from "./scheduler.js";
import { validateMealWindows } from "./meals.js";
import { resolveRemaining } from "./live-schedule.js";
import { validateDatedTasks } from "./care-plan.js";

export function previewMealSettings(record, meals, now = Date.now()) {
  const error = validateMealWindows(meals);
  if (error) return { ok: false, message: error };
  let next = structuredClone(record);
  next.meals = structuredClone(meals);
  next.mealsConfigured = true;
  let adjustments = [];
  if (next.patient) {
    const schedule = autoResolve(next.meds, meals);
    if (!schedule.ok)
      return {
        ok: false,
        message: schedule.violations.map((item) => item.msg).join(" "),
      };
    next.schedule = schedule;
    // Confirming defaults need not reschedule unrelated overdue events.
    if (validateDatedTasks(next, next.tasks, { pendingOnly: true }).length) {
      const revised = resolveRemaining(next, now);
      if (!revised.ok)
        return {
          ok: false,
          message:
            "These meal periods do not fit the remaining timetable. Review pending events and the entered timing rules before saving. Your previous meal periods are unchanged.",
        };
      next = revised.state;
      adjustments = revised.adjustments;
    }
  }
  next.audit = [
    ...(next.audit || []),
    {
      at: now,
      action: "meal_settings",
      by: "Meal period settings",
      meals: structuredClone(meals),
    },
  ].slice(-10000);
  return { ok: true, state: next, adjustments };
}
