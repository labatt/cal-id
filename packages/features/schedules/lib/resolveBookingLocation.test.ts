import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IBookingLocationDeps } from "./resolveBookingLocation";
import { resolveBookingLocation } from "./resolveBookingLocation";

const TAMPA = {
  id: 1,
  label: "Benchmark, Tampa",
  shortCode: "TPA",
  type: "inPerson",
  address: "100 Ashley Dr",
  credentialId: null,
};
const ZOOM = {
  id: 2,
  label: "Zoom",
  shortCode: "ZM",
  type: "integrations:zoom",
  address: null,
  credentialId: 3,
};

// 2026-09-11 is a Friday; 14:00Z is 10:00 in New York.
const friday = new Date("2026-09-11T14:00:00Z");

const deps = {
  findEventTypeScheduleContext: vi.fn(),
  findScheduleTimeZone: vi.fn(),
  findLocationsByScheduleId: vi.fn(),
  findRulesByScheduleId: vi.fn(),
} satisfies IBookingLocationDeps;

const context = (
  over: Partial<Awaited<ReturnType<IBookingLocationDeps["findEventTypeScheduleContext"]>>> = {}
) => ({
  useScheduleLocations: true,
  locations: [
    { type: "inPerson", address: "100 Ashley Dr" },
    { type: "integrations:zoom", credentialId: 3 },
  ],
  scheduleId: null,
  ownerDefaultScheduleId: 1,
  ownerTimeZone: "America/New_York",
  ...over,
});

const fridayZoomRule = {
  id: 1,
  position: 0,
  date: null,
  days: [5],
  startTime: null,
  endTime: null,
  locked: true,
  scheduleLocationId: 2,
};

describe("resolveBookingLocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deps.findEventTypeScheduleContext.mockResolvedValue(context());
    deps.findScheduleTimeZone.mockResolvedValue("America/New_York");
    deps.findLocationsByScheduleId.mockResolvedValue([TAMPA, ZOOM]);
    deps.findRulesByScheduleId.mockResolvedValue([fridayZoomRule]);
  });

  it("falls back to the owner's default schedule when the event type has none", async () => {
    const result = await resolveBookingLocation({ eventTypeId: 4, startTime: friday, deps });
    // The whole feature is dead on this instance if this fallback is missing: the only event
    // type here has scheduleId null.
    expect(deps.findRulesByScheduleId).toHaveBeenCalledWith({ scheduleId: 1 });
    expect(result).toEqual({ locationType: "integrations:zoom", locked: true });
  });

  it("prefers the event type's own schedule over the owner default", async () => {
    deps.findEventTypeScheduleContext.mockResolvedValue(context({ scheduleId: 9 }));
    await resolveBookingLocation({ eventTypeId: 4, startTime: friday, deps });
    expect(deps.findRulesByScheduleId).toHaveBeenCalledWith({ scheduleId: 9 });
  });

  it("returns null when the event type has not opted in", async () => {
    deps.findEventTypeScheduleContext.mockResolvedValue(context({ useScheduleLocations: false }));
    expect(await resolveBookingLocation({ eventTypeId: 4, startTime: friday, deps })).toBeNull();
    expect(deps.findRulesByScheduleId).not.toHaveBeenCalled();
  });

  it("returns null when the event type does not exist", async () => {
    deps.findEventTypeScheduleContext.mockResolvedValue(null);
    expect(await resolveBookingLocation({ eventTypeId: 404, startTime: friday, deps })).toBeNull();
  });

  it("returns null when there is no effective schedule at all", async () => {
    deps.findEventTypeScheduleContext.mockResolvedValue(
      context({ scheduleId: null, ownerDefaultScheduleId: null })
    );
    expect(await resolveBookingLocation({ eventTypeId: 4, startTime: friday, deps })).toBeNull();
  });

  it("returns null when no rule matches the instant", async () => {
    // Tuesday, so the Friday rule does not apply.
    const tuesday = new Date("2026-09-08T14:00:00Z");
    expect(await resolveBookingLocation({ eventTypeId: 4, startTime: tuesday, deps })).toBeNull();
  });

  it("goes inert when the resolved location is not offered by the event type", async () => {
    deps.findEventTypeScheduleContext.mockResolvedValue(
      context({ locations: [{ type: "inPerson", address: "100 Ashley Dr" }] })
    );
    // A rule pointing at a location the event type no longer offers must not block booking.
    expect(await resolveBookingLocation({ eventTypeId: 4, startTime: friday, deps })).toBeNull();
  });

  it("goes inert when the rule points at a deleted schedule location", async () => {
    deps.findLocationsByScheduleId.mockResolvedValue([TAMPA]);
    expect(await resolveBookingLocation({ eventTypeId: 4, startTime: friday, deps })).toBeNull();
  });

  it("uses the schedule's timezone, not the owner's, when they differ", async () => {
    deps.findScheduleTimeZone.mockResolvedValue("Australia/Sydney");
    // Friday 10:00 New York is Saturday in Sydney, so the Friday rule must not match.
    expect(await resolveBookingLocation({ eventTypeId: 4, startTime: friday, deps })).toBeNull();
  });

  it("falls back to the owner's timezone when the schedule has none", async () => {
    deps.findScheduleTimeZone.mockResolvedValue(null);
    const result = await resolveBookingLocation({ eventTypeId: 4, startTime: friday, deps });
    expect(result).toEqual({ locationType: "integrations:zoom", locked: true });
  });

  it("carries locked: false through for a default rather than a fixed location", async () => {
    deps.findRulesByScheduleId.mockResolvedValue([{ ...fridayZoomRule, locked: false }]);
    const result = await resolveBookingLocation({ eventTypeId: 4, startTime: friday, deps });
    expect(result).toEqual({ locationType: "integrations:zoom", locked: false });
  });

  it("tolerates a malformed locations column instead of throwing on the booking path", async () => {
    deps.findEventTypeScheduleContext.mockResolvedValue(context({ locations: "not-an-array" }));
    expect(await resolveBookingLocation({ eventTypeId: 4, startTime: friday, deps })).toBeNull();
  });
});
