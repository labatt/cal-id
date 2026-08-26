import { describe, expect, it } from "vitest";
import { type LocationRule, resolveLocation } from "./resolveLocation";

const TZ = "America/New_York";

const rule = (over: Partial<LocationRule> & { id: number; scheduleLocationId: number }): LocationRule => ({
  position: 0,
  date: null,
  days: [],
  startTime: null,
  endTime: null,
  locked: false,
  ...over,
});

// 2026-09-08 is a Tuesday; 14:00Z is 10:00 in New York (EDT).
const tueMorning = new Date("2026-09-08T14:00:00Z");
// 2026-09-10 is a Thursday; 18:00Z is 14:00 in New York.
const thuAfternoon = new Date("2026-09-10T18:00:00Z");

describe("resolveLocation", () => {
  it("returns null when no rule matches", () => {
    expect(resolveLocation({ rules: [], startTime: tueMorning, scheduleTimeZone: TZ })).toBeNull();
  });

  it("matches a weekday rule containing the local weekday", () => {
    const rules = [rule({ id: 1, scheduleLocationId: 7, days: [2, 3] })];
    expect(resolveLocation({ rules, startTime: tueMorning, scheduleTimeZone: TZ })).toEqual({
      scheduleLocationId: 7,
      locked: false,
      ruleId: 1,
    });
  });

  it("ignores a weekday rule that does not contain the local weekday", () => {
    const rules = [rule({ id: 1, scheduleLocationId: 7, days: [5] })];
    expect(resolveLocation({ rules, startTime: tueMorning, scheduleTimeZone: TZ })).toBeNull();
  });

  it("treats empty days as every day", () => {
    const rules = [rule({ id: 1, scheduleLocationId: 9, days: [] })];
    expect(resolveLocation({ rules, startTime: tueMorning, scheduleTimeZone: TZ })?.scheduleLocationId).toBe(
      9
    );
  });

  it("prefers a dated rule over a weekday rule even when the weekday rule sorts first", () => {
    const rules = [
      rule({ id: 1, scheduleLocationId: 7, days: [2], position: 0 }),
      rule({ id: 2, scheduleLocationId: 8, date: new Date("2026-09-08T00:00:00Z"), position: 1 }),
    ];
    expect(resolveLocation({ rules, startTime: tueMorning, scheduleTimeZone: TZ })?.scheduleLocationId).toBe(
      8
    );
  });

  it("ignores a dated rule for a different date", () => {
    const rules = [rule({ id: 2, scheduleLocationId: 8, date: new Date("2026-09-09T00:00:00Z") })];
    expect(resolveLocation({ rules, startTime: tueMorning, scheduleTimeZone: TZ })).toBeNull();
  });

  it("uses position order within dated rules", () => {
    const d = new Date("2026-09-08T00:00:00Z");
    const rules = [
      rule({ id: 2, scheduleLocationId: 8, date: d, position: 5 }),
      rule({ id: 3, scheduleLocationId: 9, date: d, position: 1 }),
    ];
    expect(resolveLocation({ rules, startTime: tueMorning, scheduleTimeZone: TZ })?.ruleId).toBe(3);
  });

  it("uses position order within weekday rules", () => {
    const rules = [
      rule({ id: 2, scheduleLocationId: 8, days: [2], position: 5 }),
      rule({ id: 3, scheduleLocationId: 9, days: [2], position: 1 }),
    ];
    expect(resolveLocation({ rules, startTime: tueMorning, scheduleTimeZone: TZ })?.ruleId).toBe(3);
  });

  it("respects a closed time window", () => {
    const rules = [
      rule({
        id: 1,
        scheduleLocationId: 7,
        days: [4],
        startTime: new Date("1970-01-01T00:00:00Z"),
        endTime: new Date("1970-01-01T12:00:00Z"),
      }),
    ];
    // 14:00 local on Thursday falls outside 00:00-12:00.
    expect(resolveLocation({ rules, startTime: thuAfternoon, scheduleTimeZone: TZ })).toBeNull();
  });

  it("treats the window start as inclusive and the end as exclusive", () => {
    const morning = [
      rule({
        id: 1,
        scheduleLocationId: 7,
        days: [4],
        startTime: new Date("1970-01-01T09:30:00Z"),
        endTime: new Date("1970-01-01T12:00:00Z"),
      }),
    ];
    const noonThu = new Date("2026-09-10T16:00:00Z"); // 12:00 New York — excluded
    expect(resolveLocation({ rules: morning, startTime: noonThu, scheduleTimeZone: TZ })).toBeNull();

    const halfTenThu = new Date("2026-09-10T13:30:00Z"); // 09:30 New York — included
    expect(resolveLocation({ rules: morning, startTime: halfTenThu, scheduleTimeZone: TZ })?.ruleId).toBe(1);
  });

  it("falls through to a later rule when the earlier one's window does not contain the time", () => {
    const rules = [
      rule({
        id: 1,
        scheduleLocationId: 7,
        days: [4],
        position: 0,
        startTime: new Date("1970-01-01T09:30:00Z"),
        endTime: new Date("1970-01-01T12:00:00Z"),
      }),
      rule({ id: 2, scheduleLocationId: 8, days: [4], position: 1 }),
    ];
    // 14:00 local misses the morning rule and lands on the all-day one.
    expect(resolveLocation({ rules, startTime: thuAfternoon, scheduleTimeZone: TZ })?.ruleId).toBe(2);
  });

  it("carries the locked flag through", () => {
    const rules = [rule({ id: 1, scheduleLocationId: 7, days: [2], locked: true })];
    expect(resolveLocation({ rules, startTime: tueMorning, scheduleTimeZone: TZ })?.locked).toBe(true);
  });
});
