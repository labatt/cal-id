import { describe, expect, it } from "vitest";
import { type LocationRule, resolveLocation } from "./resolveLocation";

/**
 * These assertions must hold no matter what TZ the process runs under — the workspace
 * re-runs *.timezone.test.ts files against several zones. A failure here means the
 * implementation is reading the server's local clock somewhere instead of the schedule's.
 */
const NY = "America/New_York";

const fridayRule: LocationRule = {
  id: 1,
  position: 0,
  date: null,
  days: [5],
  startTime: null,
  endTime: null,
  locked: true,
  scheduleLocationId: 42,
};

describe("resolveLocation across timezones", () => {
  it("uses the schedule's weekday, not the server's", () => {
    // 2026-09-11T14:00Z is Friday 10:00 in New York.
    const instant = new Date("2026-09-11T14:00:00Z");
    expect(resolveLocation({ rules: [fridayRule], startTime: instant, scheduleTimeZone: NY })?.ruleId).toBe(
      1
    );
  });

  it("matches a Friday-evening slot that has already rolled over to Saturday in UTC", () => {
    // Friday 21:00 New York is 2026-09-12T01:00Z — Saturday by UTC's calendar.
    const instant = new Date("2026-09-12T01:00:00Z");
    expect(resolveLocation({ rules: [fridayRule], startTime: instant, scheduleTimeZone: NY })?.ruleId).toBe(
      1
    );
  });

  it("does not match once the schedule's own day is Saturday", () => {
    // 2026-09-12T05:00Z is Saturday 01:00 in New York.
    const instant = new Date("2026-09-12T05:00:00Z");
    expect(resolveLocation({ rules: [fridayRule], startTime: instant, scheduleTimeZone: NY })).toBeNull();
  });

  it("applies a morning window in the schedule's zone on both sides of a DST change", () => {
    const morningRule: LocationRule = {
      ...fridayRule,
      days: [4],
      startTime: new Date("1970-01-01T09:30:00Z"),
      endTime: new Date("1970-01-01T12:00:00Z"),
    };

    // 2026-10-08T14:00Z is Thursday 10:00 EDT (UTC-4).
    const duringEdt = new Date("2026-10-08T14:00:00Z");
    expect(
      resolveLocation({ rules: [morningRule], startTime: duringEdt, scheduleTimeZone: NY })?.ruleId
    ).toBe(1);

    // 2026-11-05T15:00Z is Thursday 10:00 EST (UTC-5) — a different offset, same local time.
    const duringEst = new Date("2026-11-05T15:00:00Z");
    expect(
      resolveLocation({ rules: [morningRule], startTime: duringEst, scheduleTimeZone: NY })?.ruleId
    ).toBe(1);

    // The same UTC instant that was inside the window under EDT is outside it under EST,
    // because 14:00Z is 09:00 local once the clocks go back.
    const beforeWindowUnderEst = new Date("2026-11-05T14:00:00Z");
    expect(
      resolveLocation({ rules: [morningRule], startTime: beforeWindowUnderEst, scheduleTimeZone: NY })
    ).toBeNull();
  });

  it("resolves a dated rule on the schedule's calendar date, not UTC's", () => {
    const datedRule: LocationRule = {
      ...fridayRule,
      days: [],
      date: new Date("2026-09-11T00:00:00Z"),
      locked: false,
    };
    // Friday 21:00 New York is Saturday 01:00 UTC, but the rule is for Friday the 11th.
    const fridayEvening = new Date("2026-09-12T01:00:00Z");
    expect(
      resolveLocation({ rules: [datedRule], startTime: fridayEvening, scheduleTimeZone: NY })?.ruleId
    ).toBe(1);
  });
});
