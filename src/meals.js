export const MEAL_KEYS = ["breakfast", "lunch", "dinner"];
const mealMinutes = (clock) =>
  /^\d{2}:\d{2}$/.test(clock || "") &&
  Number(clock.slice(0, 2)) < 24 &&
  Number(clock.slice(3)) < 60
    ? Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3))
    : NaN;
const mealClock = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export function mealWindow(value) {
  if (typeof value !== "string") return { ...value };
  const center = mealMinutes(value);
  return {
    start: mealClock(Math.max(0, center - 30)),
    end: mealClock(Math.min(1439, center + 30)),
  };
}
export function validMealValue(value) {
  if (typeof value === "string") return Number.isFinite(mealMinutes(value));
  return (
    value &&
    typeof value === "object" &&
    Number.isFinite(mealMinutes(value.start)) &&
    Number.isFinite(mealMinutes(value.end)) &&
    value.start < value.end
  );
}
export function validMeals(meals) {
  return meals && MEAL_KEYS.every((key) => validMealValue(meals[key]));
}
export function validateMealWindows(meals) {
  if (!validMeals(meals))
    return "Enter a start and end time for each meal. Each period must end later on the same day.";
  if (
    MEAL_KEYS.some(
      (key, index) =>
        index &&
        mealWindow(meals[MEAL_KEYS[index - 1]]).end >
          mealWindow(meals[key]).start,
    )
  )
    return "Keep breakfast, lunch and dinner in order, with no overlapping periods.";
  return "";
}
// Old records retain their point-time rules. New ranges use the whole period
// for 'with', the start for 'before', and the end for 'after'.
export function fitsMealTime(time, relation, meals, target = "any") {
  if (relation === "any") return true;
  return MEAL_KEYS.some((key) => {
    if (target && target !== "any" && key !== target) return false;
    const value = meals[key];
    if (typeof value === "string") {
      const delta = (time - mealMinutes(value) + 1440) % 1440;
      return relation === "with"
        ? Math.min(delta, 1440 - delta) <= 30
        : relation === "before"
          ? delta >= 1380 && delta <= 1425
          : delta >= 15 && delta <= 60;
    }
    const start = mealMinutes(value.start),
      end = mealMinutes(value.end);
    return relation === "with"
      ? time >= start && time <= end
      : relation === "before"
        ? (start - time + 1440) % 1440 >= 15 &&
          (start - time + 1440) % 1440 <= 60
        : (time - end + 1440) % 1440 >= 15 && (time - end + 1440) % 1440 <= 60;
  });
}
