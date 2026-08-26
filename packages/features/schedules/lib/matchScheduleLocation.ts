export type ScheduleLocationLike = {
  id: number;
  type: string;
  address: string | null;
  credentialId: number | null;
};

export type EventTypeLocationLike = {
  type: string;
  address?: string;
  credentialId?: number;
};

const normalise = (value: string | null | undefined): string => (value ?? "").trim().toLowerCase();

/**
 * Finds the event type's own location entry corresponding to a schedule location.
 *
 * A schedule location only takes effect if the event type already offers it. That keeps
 * booking creation validating against `eventType.locations` exactly as it does today,
 * rather than introducing a second way for a location to enter the booking path.
 *
 * Returning null makes the rule inert rather than an error: a stale rule should leave the
 * booker with a normal choice of locations, not a booking page that refuses to work.
 *
 * Type alone is not enough to identify an entry — two `inPerson` entries with different
 * addresses are the whole reason this function exists — so an address or credential is
 * used to discriminate whenever the schedule location carries one.
 */
export function matchScheduleLocation(
  scheduleLocation: ScheduleLocationLike,
  eventTypeLocations: EventTypeLocationLike[]
): EventTypeLocationLike | null {
  const sameType = eventTypeLocations.filter((entry) => entry.type === scheduleLocation.type);
  if (sameType.length === 0) return null;

  if (scheduleLocation.credentialId !== null) {
    const exact = sameType.find((entry) => entry.credentialId === scheduleLocation.credentialId);
    if (exact) return exact;
    // An entry with no credentialId predates multi-account support for that app and
    // resolves to the user's only credential for it, so it is treated as a match — but
    // only after an explicit one has been ruled out.
    return sameType.find((entry) => entry.credentialId === undefined) ?? null;
  }

  if (scheduleLocation.address !== null) {
    return sameType.find((entry) => normalise(entry.address) === normalise(scheduleLocation.address)) ?? null;
  }

  return sameType[0] ?? null;
}
