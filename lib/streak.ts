/**
 * Streak calculation that respects the user's training schedule.
 *
 * A naive "consecutive calendar days with a workout" streak breaks every
 * weekend or rest day, which is illogical for users who only train 3–5
 * days/week. This helper only breaks the streak on ASSIGNED training days
 * with no recorded workout — rest days (days with no routine scheduled)
 * are skipped without penalty.
 *
 * Rules:
 *  1. Build a set of "training days of the week" from routines with a
 *     non-null `dayOfWeek`. Any day NOT in this set is a rest day.
 *  2. Walk backwards from today. If the user hasn't trained today yet
 *     and today is a training day, start from yesterday instead.
 *  3. On each step:
 *       - If the date has a logged workout → streak++.
 *       - Else if the weekday is in the training set → streak breaks.
 *       - Else (rest day) → skip, streak unchanged.
 *  4. If the user has no assigned training days, fall back to the simple
 *     "consecutive calendar days with a workout" algorithm.
 */

export interface StreakLog {
  date: Date | string;
  completed?: boolean | number;
}

export interface StreakRoutine {
  dayOfWeek: number | null;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Safety cap to avoid infinite loops on corrupt data. */
const MAX_LOOKBACK_DAYS = 400;

export function calcStreak(
  logs: StreakLog[] | undefined | null,
  routines: StreakRoutine[] | undefined | null,
  now: Date = new Date(),
): number {
  if (!logs || logs.length === 0) return 0;

  // Collect unique calendar days the user trained (completed sessions only)
  const trainedDays = new Set<string>();
  for (const log of logs) {
    if (log.completed === false || log.completed === 0) continue;
    const d = new Date(log.date);
    if (isNaN(d.getTime())) continue;
    trainedDays.add(toDateKey(d));
  }
  if (trainedDays.size === 0) return 0;

  // Training days of week = days with at least one routine scheduled
  const trainingDaysOfWeek = new Set<number>();
  for (const r of routines ?? []) {
    if (r.dayOfWeek !== null && r.dayOfWeek !== undefined) {
      trainingDaysOfWeek.add(r.dayOfWeek);
    }
  }

  // Walking cursor — snap to noon so DST shifts never push us onto the wrong day
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);

  // If no training days are assigned, fall back to consecutive-calendar-days
  if (trainingDaysOfWeek.size === 0) {
    if (!trainedDays.has(toDateKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    let streak = 0;
    for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
      if (!trainedDays.has(toDateKey(cursor))) break;
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  // Don't penalize the user for not having trained yet today on an assigned day
  if (
    trainingDaysOfWeek.has(cursor.getDay()) &&
    !trainedDays.has(toDateKey(cursor))
  ) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
    const key = toDateKey(cursor);
    const dow = cursor.getDay();
    if (trainedDays.has(key)) {
      streak++;
    } else if (trainingDaysOfWeek.has(dow)) {
      break; // missed assigned training day — streak broken
    }
    // else: rest day — skip without affecting streak
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

/**
 * Longest streak ever recorded. Uses the same "rest days don't break" rule:
 * walks the full training history chronologically and counts the longest
 * run of "no missed assigned day" between trained days.
 */
export function calcLongestStreak(
  logs: StreakLog[] | undefined | null,
  routines: StreakRoutine[] | undefined | null,
): number {
  if (!logs || logs.length === 0) return 0;

  const trainedDays = new Set<string>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;
  for (const log of logs) {
    if (log.completed === false || log.completed === 0) continue;
    const d = new Date(log.date);
    if (isNaN(d.getTime())) continue;
    trainedDays.add(toDateKey(d));
    if (!minDate || d < minDate) minDate = d;
    if (!maxDate || d > maxDate) maxDate = d;
  }
  if (!minDate || !maxDate) return 0;

  const trainingDaysOfWeek = new Set<number>();
  for (const r of routines ?? []) {
    if (r.dayOfWeek !== null && r.dayOfWeek !== undefined) {
      trainingDaysOfWeek.add(r.dayOfWeek);
    }
  }

  const cursor = new Date(minDate);
  cursor.setHours(12, 0, 0, 0);
  const end = new Date(maxDate);
  end.setHours(12, 0, 0, 0);

  let longest = 0;
  let current = 0;
  while (cursor.getTime() <= end.getTime()) {
    const key = toDateKey(cursor);
    const dow = cursor.getDay();
    if (trainedDays.has(key)) {
      current++;
      if (current > longest) longest = current;
    } else if (
      trainingDaysOfWeek.size === 0
        ? true // no schedule = every missed day breaks
        : trainingDaysOfWeek.has(dow)
    ) {
      current = 0;
    }
    // else: rest day — preserve current streak
    cursor.setDate(cursor.getDate() + 1);
  }

  return longest;
}
