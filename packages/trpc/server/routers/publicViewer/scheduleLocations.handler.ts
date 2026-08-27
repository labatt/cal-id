import type { EventTypeLocationLike } from "@calcom/features/schedules/lib/matchScheduleLocation";
import { matchScheduleLocation } from "@calcom/features/schedules/lib/matchScheduleLocation";
import type { LocationRule } from "@calcom/features/schedules/lib/resolveLocation";
import { ScheduleLocationRepository } from "@calcom/features/schedules/repositories/ScheduleLocationRepository";
import type { TScheduleLocationsInputSchema } from "./scheduleLocations.schema";

type Options = { input: TScheduleLocationsInputSchema };

export type PublicScheduleLocations = {
  timeZone: string;
  locations: { id: number; shortCode: string; compactCode: string; label: string; locationType: string }[];
  rules: LocationRule[];
};

const isEventTypeLocationArray = (value: unknown): value is EventTypeLocationLike[] =>
  Array.isArray(value) && value.every((entry) => !!entry && typeof entry === "object" && "type" in entry);

/**
 * The schedule's location rules for a public booking page, or null when the event type has
 * not opted in.
 *
 * Only locations the event type actually offers are returned, and only their short code,
 * label and resolved type — not the address or credential. The booking page already shows
 * whichever location it lands on; this endpoint exists so the page can say *which day is
 * which* before a slot is chosen, and it should not hand out more than that.
 */
const handler = async ({ input }: Options): Promise<PublicScheduleLocations | null> => {
  const context = await ScheduleLocationRepository.findEventTypeScheduleContext({
    eventTypeId: input.eventTypeId,
  });
  if (!context || !context.useScheduleLocations) return null;

  // Same fallback the booking endpoint applies: an event type with no schedule of its own
  // runs off the owner's default, which is the common case rather than an edge case.
  const effectiveScheduleId = context.scheduleId ?? context.ownerDefaultScheduleId;
  if (effectiveScheduleId === null) return null;
  if (!isEventTypeLocationArray(context.locations)) return null;

  const [scheduleTimeZone, scheduleLocations, rules] = await Promise.all([
    ScheduleLocationRepository.findScheduleTimeZone({ scheduleId: effectiveScheduleId }),
    ScheduleLocationRepository.findLocationsByScheduleId({ scheduleId: effectiveScheduleId }),
    ScheduleLocationRepository.findRulesByScheduleId({ scheduleId: effectiveScheduleId }),
  ]);

  const timeZone = scheduleTimeZone ?? context.ownerTimeZone;
  if (!timeZone) return null;

  const usable = scheduleLocations.flatMap((location) => {
    const match = matchScheduleLocation(location, context.locations as EventTypeLocationLike[]);
    if (!match) return [];
    return [
      {
        id: location.id,
        shortCode: location.shortCode,
        // Falls back here as well as on write, so rows created before this existed still get
        // something sensible on a phone rather than an empty cell.
        compactCode: location.compactCode || location.shortCode.slice(0, 2),
        label: location.label,
        locationType: match.type,
      },
    ];
  });

  const usableIds = new Set(usable.map((l) => l.id));

  return {
    timeZone,
    locations: usable,
    // A rule pointing at a location the event type does not offer is inert, so it is dropped
    // here rather than left for the client to resolve into nothing.
    rules: rules.filter((rule) => usableIds.has(rule.scheduleLocationId)),
  };
};

export default handler;
