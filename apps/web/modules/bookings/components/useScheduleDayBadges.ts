"use client";

import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import { useBookerStoreContext } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import { resolveLocationForDay } from "@calcom/features/schedules/lib/resolveLocationForDay";
import {
  resolveSlotLocationBadge,
  type SlotLocationBadge,
} from "@calcom/features/schedules/lib/resolveSlotLocationBadge";
import { trpc } from "@calcom/trpc/react";
import { useCallback } from "react";

export type ScheduleDayBadges = {
  /** null when this day has no location rule, so the calendar leaves it unmarked. */
  getDayBadge: (date: Dayjs) => { text: string; compactText?: string; title?: string } | null;
  /** Only the locations that actually appear, for a legend under the calendar. */
  legend: { shortCode: string; label: string }[];
  hasAny: boolean;
};

/**
 * Short location codes for the booking calendar, so a booker can see which days are where
 * before committing to one.
 */
export const useScheduleDayBadges = (): ScheduleDayBadges => {
  const eventId = useBookerStoreContext((state) => state.eventId);

  const { data } = trpc.viewer.public.scheduleLocations.useQuery(
    { eventTypeId: eventId ?? 0 },
    { enabled: !!eventId, staleTime: 5 * 60 * 1000 }
  );

  const getDayBadge = useCallback(
    (date: Dayjs) => {
      if (!data) return null;

      /**
       * The grid is drawn in the booker's own timezone, but the rules are the organiser's, so
       * each cell is converted before it is resolved. Skipping this marks the wrong days for
       * anyone far enough east or west — the same trap the booking path has.
       */
      const local = date.tz(data.timeZone);
      const day = resolveLocationForDay({
        rules: data.rules,
        localDate: local.format("YYYY-MM-DD"),
        localWeekday: local.day(),
      });
      if (!day) return null;
      if (day.kind === "mixed")
        return { text: "··", compactText: "··", title: "More than one location that day" };

      const location = data.locations.find((l) => l.id === day.scheduleLocationId);
      if (!location) return null;
      return { text: location.shortCode, compactText: location.compactCode, title: location.label };
    },
    [data]
  );

  const legend = (data?.locations ?? []).map((l) => ({ shortCode: l.shortCode, label: l.label }));

  return { getDayBadge, legend, hasAny: !!data && data.rules.length > 0 };
};

/**
 * The location for the currently selected *date*, for the summary beside the calendar.
 *
 * Deliberately keyed on the date rather than the chosen timeslot: that row only exists while
 * someone is still browsing days, and by the time a slot is picked the layout has replaced it
 * with the booking form. A timeslot-based hook there resolves to null for the row's entire
 * lifetime, which is exactly what the first attempt did.
 */
export const useSelectedDateLocation = (): { label: string; locked: boolean } | null => {
  const eventId = useBookerStoreContext((state) => state.eventId);
  const selectedDate = useBookerStoreContext((state) => state.selectedDate);

  const { data } = trpc.viewer.public.scheduleLocations.useQuery(
    { eventTypeId: eventId ?? 0 },
    { enabled: !!eventId, staleTime: 5 * 60 * 1000 }
  );

  if (!data || !selectedDate) return null;

  const local = dayjs.tz(selectedDate, data.timeZone);
  if (!local.isValid()) return null;

  const day = resolveLocationForDay({
    rules: data.rules,
    localDate: local.format("YYYY-MM-DD"),
    localWeekday: local.day(),
  });
  if (!day) return null;
  if (day.kind === "mixed") return { label: "More than one location that day", locked: false };

  const location = data.locations.find((l) => l.id === day.scheduleLocationId);
  return location ? { label: location.label, locked: day.locked } : null;
};

export type { SlotLocationBadge } from "@calcom/features/schedules/lib/resolveSlotLocationBadge";

/**
 * The location code for a single timeslot, for the slot list.
 *
 * All the judgement lives in resolveSlotLocationBadge, which is pure and unit tested; this
 * only supplies it with the query's data and the schedule's timezone.
 */
export const useSlotLocationBadges = (): ((isoTime: string) => SlotLocationBadge | null) => {
  const eventId = useBookerStoreContext((state) => state.eventId);

  const { data } = trpc.viewer.public.scheduleLocations.useQuery(
    { eventTypeId: eventId ?? 0 },
    { enabled: !!eventId, staleTime: 5 * 60 * 1000 }
  );

  return useCallback(
    (isoTime: string) => {
      if (!data) return null;
      return resolveSlotLocationBadge({
        locations: data.locations,
        rules: data.rules,
        startTime: new Date(isoTime),
        scheduleTimeZone: data.timeZone,
      });
    },
    [data]
  );
};
