"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { Select } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";

const NONE = "none";

type Option = { value: string; label: string };

/**
 * The default location for one weekday, rendered on that day's row in the availability editor.
 *
 * Reads through the same query the locations card uses, so react-query serves both from one
 * request and the two stay consistent without either owning the data.
 */
export const WeekdayLocationSelect = ({
  scheduleId,
  weekdayIndex,
}: {
  scheduleId: number;
  weekdayIndex: number;
}) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();

  const { data } = trpc.viewer.availability.scheduleLocations.list.useQuery({ scheduleId });

  const setRecurringRules = trpc.viewer.availability.scheduleLocations.setRecurringRules.useMutation({
    onSuccess: async () => utils.viewer.availability.scheduleLocations.list.invalidate({ scheduleId }),
    onError: (error) => showToast(error.message, "error"),
  });

  const locations = data?.locations ?? [];
  const rules = data?.rules ?? [];

  // Only recurring rules matter here; dated rules are overrides managed on the calendar below.
  const recurring = rules.filter((rule) => rule.date === null);
  const mine = recurring.find((rule) => rule.days.includes(weekdayIndex));
  const selectedLocation = mine ? locations.find((l) => l.id === mine.scheduleLocationId) : undefined;

  const options: Option[] = [
    { value: NONE, label: t("no_default_location") },
    ...locations.map((location) => ({ value: String(location.id), label: location.label })),
  ];
  const value = options.find((option) =>
    selectedLocation ? option.value === String(selectedLocation.id) : option.value === NONE
  );

  /**
   * setRecurringRules replaces the whole baseline, so a change to one day has to be folded
   * into the current set and sent as a whole. Every other day is rewritten exactly as it was.
   */
  const commit = (next: { scheduleLocationId: number; locked: boolean } | null) => {
    const rebuilt = recurring
      .map((rule) => ({
        scheduleLocationId: rule.scheduleLocationId,
        days: rule.days.filter((day) => day !== weekdayIndex),
        startTime: rule.startTime ? new Date(rule.startTime) : null,
        endTime: rule.endTime ? new Date(rule.endTime) : null,
        locked: rule.locked,
      }))
      // A rule that covered only this weekday has no days left and would otherwise be stored
      // as a rule matching nothing.
      .filter((rule) => rule.days.length > 0);

    if (next) {
      rebuilt.push({
        scheduleLocationId: next.scheduleLocationId,
        days: [weekdayIndex],
        startTime: null,
        endTime: null,
        locked: next.locked,
      });
    }

    setRecurringRules.mutate({
      scheduleId,
      rules: rebuilt.map((rule) => ({
        scheduleLocationId: rule.scheduleLocationId,
        days: rule.days,
        startTime: rule.startTime ? toHHmm(rule.startTime) : null,
        endTime: rule.endTime ? toHHmm(rule.endTime) : null,
        locked: rule.locked,
      })),
    });
  };

  if (locations.length === 0) return null;

  return (
    <div className="flex items-center gap-2" data-testid={`weekday-location-${weekdayIndex}`}>
      <div className="min-w-[180px]">
        <Select
          size="sm"
          options={options}
          value={value}
          isDisabled={setRecurringRules.isPending}
          onChange={(option) => {
            if (!option || option.value === NONE) {
              commit(null);
              return;
            }
            commit({ scheduleLocationId: Number(option.value), locked: mine?.locked ?? false });
          }}
        />
      </div>
      {selectedLocation ? (
        <Button
          type="button"
          variant="icon"
          color={mine?.locked ? "primary" : "minimal"}
          StartIcon={mine?.locked ? "lock" : "lock-open"}
          disabled={setRecurringRules.isPending}
          tooltip={mine?.locked ? t("location_is_fixed") : t("location_is_a_default")}
          aria-label={mine?.locked ? t("location_is_fixed") : t("location_is_a_default")}
          aria-pressed={!!mine?.locked}
          onClick={() =>
            commit({ scheduleLocationId: selectedLocation.id, locked: !(mine?.locked ?? false) })
          }
        />
      ) : null}
    </div>
  );
};

/** Prisma hands back @db.Time pinned to 1970-01-01 UTC, so the wall clock is in the UTC parts. */
const toHHmm = (value: Date): string =>
  `${value.getUTCHours().toString().padStart(2, "0")}:${value.getUTCMinutes().toString().padStart(2, "0")}`;
