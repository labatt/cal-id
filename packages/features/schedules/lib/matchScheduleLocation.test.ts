import { describe, expect, it } from "vitest";
import { matchScheduleLocation, type ScheduleLocationLike } from "./matchScheduleLocation";

const tampa: ScheduleLocationLike = {
  id: 1,
  type: "inPerson",
  address: "100 Ashley Dr, Tampa",
  credentialId: null,
};

const zoom: ScheduleLocationLike = {
  id: 2,
  type: "integrations:zoom",
  address: null,
  credentialId: 3,
};

describe("matchScheduleLocation", () => {
  it("returns null when the event type offers no location of that type", () => {
    expect(matchScheduleLocation(zoom, [{ type: "inPerson", address: "somewhere" }])).toBeNull();
  });

  it("returns null when the event type has no locations at all", () => {
    expect(matchScheduleLocation(zoom, [])).toBeNull();
  });

  it("matches an integration on type and credentialId", () => {
    expect(matchScheduleLocation(zoom, [{ type: "integrations:zoom", credentialId: 3 }])).toEqual({
      type: "integrations:zoom",
      credentialId: 3,
    });
  });

  it("does not match an integration whose credentialId differs", () => {
    expect(matchScheduleLocation(zoom, [{ type: "integrations:zoom", credentialId: 99 }])).toBeNull();
  });

  it("matches an integration when the event type omits credentialId", () => {
    expect(matchScheduleLocation(zoom, [{ type: "integrations:zoom" }])).toEqual({
      type: "integrations:zoom",
    });
  });

  it("prefers the exact credentialId over an entry that omits it", () => {
    const match = matchScheduleLocation(zoom, [
      { type: "integrations:zoom" },
      { type: "integrations:zoom", credentialId: 3 },
    ]);
    expect(match).toEqual({ type: "integrations:zoom", credentialId: 3 });
  });

  it("distinguishes two inPerson entries by address", () => {
    const match = matchScheduleLocation(tampa, [
      { type: "inPerson", address: "1 Biscayne Blvd, Miami" },
      { type: "inPerson", address: "100 Ashley Dr, Tampa" },
    ]);
    expect(match).toEqual({ type: "inPerson", address: "100 Ashley Dr, Tampa" });
  });

  it("ignores surrounding whitespace and case when comparing addresses", () => {
    expect(matchScheduleLocation(tampa, [{ type: "inPerson", address: "  100 ASHLEY DR, TAMPA " }])).toEqual({
      type: "inPerson",
      address: "  100 ASHLEY DR, TAMPA ",
    });
  });

  it("returns null when no inPerson address matches", () => {
    expect(matchScheduleLocation(tampa, [{ type: "inPerson", address: "elsewhere" }])).toBeNull();
  });

  it("falls back to the sole entry of that type when the schedule location has no discriminator", () => {
    const bare: ScheduleLocationLike = { id: 3, type: "attendeeInPerson", address: null, credentialId: null };
    expect(matchScheduleLocation(bare, [{ type: "attendeeInPerson" }])).toEqual({
      type: "attendeeInPerson",
    });
  });
});
