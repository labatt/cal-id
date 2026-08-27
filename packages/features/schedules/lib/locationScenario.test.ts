import { describe, expect, it } from "vitest";
import { matchScheduleLocation } from "./matchScheduleLocation";
import { type LocationRule, resolveLocation } from "./resolveLocation";

/**
 * A worked example of the pattern this feature was built for: in an office three weekdays a
 * week, at home the rest, with the home days fixed to video.
 *
 * The unit tests around it check each piece in isolation; this checks that a realistic set of
 * rows actually produces the intended answers end to end, which is where the two earlier
 * mistakes hid — a location typed inPerson when it meant Zoom, and an empty-string address
 * that is not null and so failed to match anything.
 */
const scheduleLocations = [
  { id: 1, type: "inPerson", address: "4030 W Boy Scout Blvd Ste 500, Tampa, FL 33607", credentialId: null },
  { id: 2, type: "integrations:zoom", address: null, credentialId: 3 },
];
const eventTypeLocations = [
  { type: "integrations:zoom", credentialId: 3 },
  { type: "inPerson", address: "4030 W Boy Scout Blvd Ste 500, Tampa, FL 33607" },
];
const rules: LocationRule[] = [
  {
    id: 11,
    position: 0,
    date: null,
    days: [2],
    startTime: null,
    endTime: null,
    locked: false,
    scheduleLocationId: 1,
  },
  {
    id: 12,
    position: 1,
    date: null,
    days: [3],
    startTime: null,
    endTime: null,
    locked: false,
    scheduleLocationId: 1,
  },
  {
    id: 13,
    position: 2,
    date: null,
    days: [4],
    startTime: null,
    endTime: null,
    locked: false,
    scheduleLocationId: 1,
  },
  {
    id: 14,
    position: 3,
    date: null,
    days: [5],
    startTime: null,
    endTime: null,
    locked: true,
    scheduleLocationId: 2,
  },
];
const TZ = "America/New_York";

const resolveFor = (iso: string) => {
  const r = resolveLocation({ rules, startTime: new Date(iso), scheduleTimeZone: TZ });
  if (!r) return null;
  const loc = scheduleLocations.find((l) => l.id === r.scheduleLocationId);
  if (!loc) return null;
  const match = matchScheduleLocation(loc, eventTypeLocations);
  return match ? { type: match.type, locked: r.locked } : null;
};

describe("office-and-home scenario", () => {
  it("Tuesday 10:00 ET resolves to the Tampa office, changeable", () => {
    expect(resolveFor("2026-09-08T14:00:00Z")).toEqual({ type: "inPerson", locked: false });
  });
  it("Thursday 10:00 ET resolves to the Tampa office", () => {
    expect(resolveFor("2026-09-10T14:00:00Z")).toEqual({ type: "inPerson", locked: false });
  });
  it("Friday 10:00 ET resolves to Zoom and is locked", () => {
    expect(resolveFor("2026-09-11T14:00:00Z")).toEqual({ type: "integrations:zoom", locked: true });
  });
  it("Monday has no rule, so the booker keeps a free choice", () => {
    expect(resolveFor("2026-09-07T14:00:00Z")).toBeNull();
  });
  it("a Friday evening slot that is already Saturday in UTC is still Zoom", () => {
    expect(resolveFor("2026-09-12T01:00:00Z")).toEqual({ type: "integrations:zoom", locked: true });
  });
});
