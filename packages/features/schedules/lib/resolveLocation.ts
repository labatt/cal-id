import dayjs from "@calcom/dayjs";

export type LocationRule = {
  id: number;
  position: number;
  date: Date | null;
  days: number[];
  startTime: Date | null;
  endTime: Date | null;
  locked: boolean;
  scheduleLocationId: number;
};

export type ResolvedLocation = {
  scheduleLocationId: number;
  locked: boolean;
  ruleId: number;
};

const MINUTES_PER_DAY = 24 * 60;

/**
 * Prisma hands back a @db.Time column as a Date pinned to 1970-01-01 UTC, so the
 * wall-clock value lives in the UTC accessors. Reading it with getHours() instead
 * would shift every window by the server's own offset.
 */
const minutesFromTimeColumn = (value: Date): number => value.getUTCHours() * 60 + value.getUTCMinutes();

const containsLocalMinutes = (rule: LocationRule, localMinutes: number): boolean => {
  const from = rule.startTime ? minutesFromTimeColumn(rule.startTime) : 0;
  const to = rule.endTime ? minutesFromTimeColumn(rule.endTime) : MINUTES_PER_DAY;
  return localMinutes >= from && localMinutes < to;
};

const byPosition = (a: LocationRule, b: LocationRule): number => a.position - b.position;

/**
 * Picks the single location rule that governs a booking instant, or null when none does.
 *
 * Everything is judged in the schedule owner's timezone rather than the booker's or the
 * server's: a Friday 10:00 slot in New York is already Saturday in Sydney, and "Thursday
 * morning" is a fact about where the organiser is, not about who is looking at the page.
 *
 * Dated rules are considered before recurring ones so a one-off overrides the usual week,
 * mirroring how Availability treats its own `date` rows.
 */
export function resolveLocation({
  rules,
  startTime,
  scheduleTimeZone,
}: {
  rules: LocationRule[];
  startTime: Date;
  scheduleTimeZone: string;
}): ResolvedLocation | null {
  const local = dayjs(startTime).tz(scheduleTimeZone);
  const localDate = local.format("YYYY-MM-DD");
  const localWeekday = local.day();
  const localMinutes = local.hour() * 60 + local.minute();

  // A @db.Date column also arrives as UTC midnight, so it is compared on its UTC
  // calendar date rather than being converted into the schedule's zone — converting
  // would roll it back a day for any zone behind UTC.
  const dated = rules.filter(
    (candidate) => candidate.date !== null && dayjs.utc(candidate.date).format("YYYY-MM-DD") === localDate
  );
  const recurring = rules.filter(
    (candidate) =>
      candidate.date === null && (candidate.days.length === 0 || candidate.days.includes(localWeekday))
  );

  for (const group of [dated, recurring]) {
    const match = [...group]
      .sort(byPosition)
      .find((candidate) => containsLocalMinutes(candidate, localMinutes));
    if (match) {
      return { scheduleLocationId: match.scheduleLocationId, locked: match.locked, ruleId: match.id };
    }
  }

  return null;
}
