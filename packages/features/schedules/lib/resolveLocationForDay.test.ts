import { describe, expect, it } from "vitest";
import type { LocationRule } from "./resolveLocation";
import { resolveLocationForDay } from "./resolveLocationForDay";

const rule = (over: Partial<LocationRule> & { id: number; scheduleLocationId: number }): LocationRule => ({
  position: 0,
  date: null,
  days: [],
  startTime: null,
  endTime: null,
  locked: false,
  ...over,
});

// 2026-09-08 is a Tuesday.
const TUESDAY = { localDate: "2026-09-08", localWeekday: 2 };

describe("resolveLocationForDay", () => {
  it("returns null when nothing applies", () => {
    expect(resolveLocationForDay({ rules: [], ...TUESDAY })).toBeNull();
  });

  it("marks a day governed by one weekday rule", () => {
    const rules = [rule({ id: 1, scheduleLocationId: 7, days: [2] })];
    expect(resolveLocationForDay({ rules, ...TUESDAY })).toEqual({
      kind: "single",
      scheduleLocationId: 7,
      locked: false,
    });
  });

  it("carries the locked flag so the marker can say the day is fixed", () => {
    const rules = [rule({ id: 1, scheduleLocationId: 7, days: [2], locked: true })];
    expect(resolveLocationForDay({ rules, ...TUESDAY })).toMatchObject({ locked: true });
  });

  it("lets a dated rule override the weekly pattern entirely", () => {
    const rules = [
      rule({ id: 1, scheduleLocationId: 7, days: [2] }),
      rule({ id: 2, scheduleLocationId: 9, date: new Date("2026-09-08T00:00:00Z") }),
    ];
    expect(resolveLocationForDay({ rules, ...TUESDAY })).toMatchObject({ scheduleLocationId: 9 });
  });

  it("ignores a dated rule belonging to another date", () => {
    const rules = [rule({ id: 2, scheduleLocationId: 9, date: new Date("2026-09-09T00:00:00Z") })];
    expect(resolveLocationForDay({ rules, ...TUESDAY })).toBeNull();
  });

  it("reports mixed when morning and afternoon differ", () => {
    const rules = [
      rule({
        id: 1,
        scheduleLocationId: 7,
        days: [2],
        position: 0,
        startTime: new Date("1970-01-01T09:00:00Z"),
        endTime: new Date("1970-01-01T12:00:00Z"),
      }),
      rule({ id: 2, scheduleLocationId: 9, days: [2], position: 1 }),
    ];
    expect(resolveLocationForDay({ rules, ...TUESDAY })).toEqual({ kind: "mixed" });
  });

  it("is not mixed when a windowed rule is followed by more of the same location", () => {
    const rules = [
      rule({
        id: 1,
        scheduleLocationId: 7,
        days: [2],
        position: 0,
        startTime: new Date("1970-01-01T09:00:00Z"),
        endTime: new Date("1970-01-01T12:00:00Z"),
      }),
      rule({ id: 2, scheduleLocationId: 7, days: [2], position: 1 }),
    ];
    expect(resolveLocationForDay({ rules, ...TUESDAY })).toMatchObject({ kind: "single" });
  });

  it("is not mixed when the first rule covers the whole day, since nothing after it can win", () => {
    const rules = [
      rule({ id: 1, scheduleLocationId: 7, days: [2], position: 0 }),
      rule({ id: 2, scheduleLocationId: 9, days: [2], position: 1 }),
    ];
    expect(resolveLocationForDay({ rules, ...TUESDAY })).toMatchObject({
      kind: "single",
      scheduleLocationId: 7,
    });
  });

  it("treats an empty days array as covering this weekday too", () => {
    const rules = [rule({ id: 1, scheduleLocationId: 7, days: [] })];
    expect(resolveLocationForDay({ rules, ...TUESDAY })).toMatchObject({ scheduleLocationId: 7 });
  });
});
