"use client";

import { useBookerStoreContext } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import { resolveLocation } from "@calcom/features/schedules/lib/resolveLocation";
import { trpc } from "@calcom/trpc/react";
import { useMemo } from "react";

export type ScheduleLocationForSlot = {
  /** The location type to submit, e.g. "inPerson" or "integrations:zoom". */
  locationType: string;
  label: string;
  shortCode: string;
  /** True when the booker must not be offered anything else. */
  locked: boolean;
};

/**
 * The location the organiser's schedule dictates for the currently selected slot, or null
 * when the schedule has nothing to say about it.
 *
 * Resolution happens on the client using the same pure function the booking endpoint uses, so
 * the two cannot drift. The server still enforces locked rules on submit — this only decides
 * what the booker is shown.
 */
export const useScheduleLocation = (): ScheduleLocationForSlot | null => {
  const eventId = useBookerStoreContext((state) => state.eventId);
  const selectedTimeslot = useBookerStoreContext((state) => state.selectedTimeslot);

  const { data } = trpc.viewer.public.scheduleLocations.useQuery(
    { eventTypeId: eventId ?? 0 },
    {
      enabled: !!eventId,
      // The rules change about as often as the organiser's travel plans, and re-fetching
      // per slot would put a request in front of every click.
      staleTime: 5 * 60 * 1000,
    }
  );

  return useMemo(() => {
    if (!data || !selectedTimeslot) return null;

    const startTime = new Date(selectedTimeslot);
    if (Number.isNaN(startTime.getTime())) return null;

    // The schedule's own timezone, never the booker's: a Friday 10:00 slot in New York is
    // already Saturday for a booker in Sydney, and "Friday" means Friday where the organiser
    // is.
    const resolved = resolveLocation({
      rules: data.rules,
      startTime,
      scheduleTimeZone: data.timeZone,
    });
    if (!resolved) return null;

    const location = data.locations.find((l) => l.id === resolved.scheduleLocationId);
    if (!location) return null;

    return {
      locationType: location.locationType,
      label: location.label,
      shortCode: location.shortCode,
      locked: resolved.locked,
    };
  }, [data, selectedTimeslot]);
};
