"use client";

import type { Dayjs } from "@calcom/dayjs";
import { useBookerStoreContext } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import { resolveLocationForDay } from "@calcom/features/schedules/lib/resolveLocationForDay";
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
