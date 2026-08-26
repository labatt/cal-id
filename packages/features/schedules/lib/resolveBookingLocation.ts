import type { EventTypeLocationLike } from "./matchScheduleLocation";
import { matchScheduleLocation } from "./matchScheduleLocation";
import type { LocationRule } from "./resolveLocation";
import { resolveLocation } from "./resolveLocation";

export type ResolvedBookingLocation = {
  /** The location type to submit, e.g. "inPerson" or "integrations:zoom". */
  locationType: string;
  /** True when the booker must not be offered anything else. */
  locked: boolean;
};

type ScheduleContext = {
  useScheduleLocations: boolean;
  locations: unknown;
  scheduleId: number | null;
  ownerDefaultScheduleId: number | null;
  ownerTimeZone: string | null;
};

export interface IBookingLocationDeps {
  findEventTypeScheduleContext(args: { eventTypeId: number }): Promise<ScheduleContext | null>;
  findScheduleTimeZone(args: { scheduleId: number }): Promise<string | null>;
  findLocationsByScheduleId(args: {
    scheduleId: number;
  }): Promise<{ id: number; type: string; address: string | null; credentialId: number | null }[]>;
  findRulesByScheduleId(args: { scheduleId: number }): Promise<LocationRule[]>;
}

const isEventTypeLocationArray = (value: unknown): value is EventTypeLocationLike[] =>
  Array.isArray(value) && value.every((entry) => !!entry && typeof entry === "object" && "type" in entry);

/**
 * Works out which location a booking at `startTime` should use, or null when the schedule has
 * nothing to say about it.
 *
 * Returning null rather than throwing is deliberate everywhere below. This runs on the
 * booking path, and a stale or half-configured rule should leave the booker with the normal
 * choice of locations rather than a page that refuses to work.
 */
export async function resolveBookingLocation({
  eventTypeId,
  startTime,
  deps,
}: {
  eventTypeId: number;
  startTime: Date;
  deps: IBookingLocationDeps;
}): Promise<ResolvedBookingLocation | null> {
  const context = await deps.findEventTypeScheduleContext({ eventTypeId });
  if (!context || !context.useScheduleLocations) return null;

  /**
   * An event type with no schedule of its own runs off the owner's default schedule. Reading
   * only eventType.schedule would resolve nothing for those event types while looking
   * perfectly correct — and "no schedule attached" is the default state, not an edge case.
   */
  const effectiveScheduleId = context.scheduleId ?? context.ownerDefaultScheduleId;
  if (effectiveScheduleId === null) return null;

  if (!isEventTypeLocationArray(context.locations)) return null;

  const [scheduleTimeZone, scheduleLocations, rules] = await Promise.all([
    deps.findScheduleTimeZone({ scheduleId: effectiveScheduleId }),
    deps.findLocationsByScheduleId({ scheduleId: effectiveScheduleId }),
    deps.findRulesByScheduleId({ scheduleId: effectiveScheduleId }),
  ]);

  // A schedule with no timezone of its own follows its owner's, which is how availability
  // already treats it.
  const timeZone = scheduleTimeZone ?? context.ownerTimeZone;
  if (!timeZone) return null;

  const resolved = resolveLocation({ rules, startTime, scheduleTimeZone: timeZone });
  if (!resolved) return null;

  const scheduleLocation = scheduleLocations.find((l) => l.id === resolved.scheduleLocationId);
  if (!scheduleLocation) return null;

  // The event type must already offer this location, so booking creation keeps validating
  // against eventType.locations exactly as it does without this feature.
  const match = matchScheduleLocation(scheduleLocation, context.locations);
  if (!match) return null;

  return { locationType: match.type, locked: resolved.locked };
}
