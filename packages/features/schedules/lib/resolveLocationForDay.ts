import type { LocationRule } from "./resolveLocation";

export type DayLocation =
  | { kind: "single"; scheduleLocationId: number; locked: boolean }
  /** More than one location applies during the day, so no single code describes it. */
  | { kind: "mixed" };

/**
 * Which location governs a whole calendar day, for marking the booking calendar before a slot
 * is chosen.
 *
 * This deliberately does not call resolveLocation: that answers "what applies at this
 * instant", and a day is not an instant. A day whose morning and afternoon differ has no
 * single answer, and saying "Tampa" because the morning says so would be worse than saying
 * nothing definite.
 *
 * `localDate` is a YYYY-MM-DD string in the schedule's own timezone, not the booker's — the
 * caller converts, because only it knows which zone the grid is drawn in.
 */
export function resolveLocationForDay({
  rules,
  localDate,
  localWeekday,
}: {
  rules: LocationRule[];
  localDate: string;
  /** 0 = Sunday, matching Availability.days. */
  localWeekday: number;
}): DayLocation | null {
  const toDateKey = (value: Date): string => value.toISOString().slice(0, 10);

  // Dated rules override the weekly pattern entirely, so if any exist for this date the
  // recurring ones cannot contribute to the day at all.
  const dated = rules.filter((rule) => rule.date !== null && toDateKey(rule.date) === localDate);
  const candidates = dated.length
    ? dated
    : rules.filter(
        (rule) => rule.date === null && (rule.days.length === 0 || rule.days.includes(localWeekday))
      );

  if (candidates.length === 0) return null;

  const ordered = [...candidates].sort((a, b) => a.position - b.position);
  const distinctLocations = new Set(ordered.map((rule) => rule.scheduleLocationId));

  // One location across every applicable rule means the day reads as that location however
  // the windows are arranged.
  if (distinctLocations.size === 1) {
    const winner = ordered[0];
    return { kind: "single", scheduleLocationId: winner.scheduleLocationId, locked: winner.locked };
  }

  // Several locations, but if the first rule covers the whole day nothing after it can ever
  // win, so the day is still unambiguous.
  const first = ordered[0];
  if (first.startTime === null && first.endTime === null) {
    return { kind: "single", scheduleLocationId: first.scheduleLocationId, locked: first.locked };
  }

  return { kind: "mixed" };
}
