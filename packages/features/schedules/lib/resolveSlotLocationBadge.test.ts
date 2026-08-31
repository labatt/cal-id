import { describe, expect, it } from "vitest";
import type { LocationRule } from "./resolveLocation";
import { type BadgeLocation, resolveSlotLocationBadge } from "./resolveSlotLocationBadge";

const rule = (over: Partial<LocationRule> & { id: number; scheduleLocationId: number }): LocationRule => ({
  position: 0,
  date: null,
  days: [],
  startTime: null,
  endTime: null,
  locked: false,
  ...over,
});

/** Prisma returns a @db.Time column pinned to 1970-01-01 UTC. */
const atTime = (hhmm: string): Date => new Date(`1970-01-01T${hhmm}:00.000Z`);

const TAMPA: BadgeLocation = { id: 1, shortCode: "TPA", compactCode: "TP", label: "Benchmark, Tampa" };
const ZOOM: BadgeLocation = { id: 2, shortCode: "ZOOM", compactCode: "ZM", label: "Zoom" };

const NEW_YORK = "America/New_York";
// 2026-09-08 is a Tuesday; 13:00Z is 09:00 in New York.
const TUESDAY_9AM = new Date("2026-09-08T13:00:00.000Z");
const TUESDAY_3PM = new Date("2026-09-08T19:00:00.000Z");

const resolve = (locations: BadgeLocation[], rules: LocationRule[], startTime = TUESDAY_9AM) =>
  resolveSlotLocationBadge({ locations, rules, startTime, scheduleTimeZone: NEW_YORK });

describe("resolveSlotLocationBadge", () => {
  it("returns null when the schedule has no locations", () => {
    expect(resolve([], [])).toBeNull();
  });

  it("returns null for an unparseable time rather than marking the slot wrongly", () => {
    expect(resolve([TAMPA], [], new Date("not a date"))).toBeNull();
  });

  it("names one location only when the rule locks it", () => {
    const rules = [rule({ id: 1, scheduleLocationId: TAMPA.id, days: [2], locked: true })];
    expect(resolve([TAMPA, ZOOM], rules)).toEqual({
      text: "TPA",
      compactText: "TP",
      title: "Benchmark, Tampa",
    });
  });

  it("lists every location for an unlocked rule, because the booker may still choose", () => {
    const rules = [rule({ id: 1, scheduleLocationId: TAMPA.id, days: [2] })];
    expect(resolve([TAMPA, ZOOM], rules)).toEqual({
      text: "TPA / ZOOM",
      compactText: "TP/ZM",
      title: "Benchmark, Tampa or Zoom",
    });
  });

  it("leads with the default so an unlocked slot still shows the likely answer first", () => {
    const rules = [rule({ id: 1, scheduleLocationId: ZOOM.id, days: [2] })];
    // ZOOM is second in the locations array but first here, because it is the day's default.
    expect(resolve([TAMPA, ZOOM], rules)).toMatchObject({ text: "ZOOM / TPA" });
  });

  it("names one location for an unlocked rule when there is nothing else to choose", () => {
    const rules = [rule({ id: 1, scheduleLocationId: TAMPA.id, days: [2] })];
    expect(resolve([TAMPA], rules)).toEqual({ text: "TPA", compactText: "TP", title: "Benchmark, Tampa" });
  });

  it("lists every location when no rule governs the slot", () => {
    expect(resolve([TAMPA, ZOOM], [])).toEqual({
      text: "TPA / ZOOM",
      compactText: "TP/ZM",
      title: "Benchmark, Tampa or Zoom",
    });
  });

  it("states the single location plainly when there is only one, with no slash", () => {
    expect(resolve([ZOOM], [])).toEqual({ text: "ZOOM", compactText: "ZM", title: "Zoom" });
  });

  it("falls back to the short code when a location has no compact code", () => {
    const noCompact: BadgeLocation = { ...ZOOM, compactCode: null };
    expect(resolve([TAMPA, noCompact], [])).toMatchObject({ text: "TPA / ZOOM", compactText: "TP/ZOOM" });
  });

  it("omits the compact form when it would repeat the full one", () => {
    const same: BadgeLocation = { id: 3, shortCode: "HQ", compactCode: "HQ", label: "Head office" };
    expect(resolve([same], [])).toEqual({ text: "HQ", title: "Head office", compactText: undefined });
  });

  it("returns null when a rule points at a location that was not loaded", () => {
    const rules = [rule({ id: 1, scheduleLocationId: 999, days: [2] })];
    expect(resolve([TAMPA, ZOOM], rules)).toBeNull();
  });

  it("distinguishes two slots on the same day that fall in different windows", () => {
    const rules = [
      rule({
        id: 1,
        scheduleLocationId: TAMPA.id,
        days: [2],
        position: 0,
        endTime: atTime("12:00"),
        locked: true,
      }),
      rule({ id: 2, scheduleLocationId: ZOOM.id, days: [2], position: 1, locked: true }),
    ];
    // The whole point of resolving per slot rather than per day: the day is mixed, but each
    // individual slot still has one correct answer.
    expect(resolve([TAMPA, ZOOM], rules, TUESDAY_9AM)).toMatchObject({ text: "TPA" });
    expect(resolve([TAMPA, ZOOM], rules, TUESDAY_3PM)).toMatchObject({ text: "ZOOM" });
  });
});
