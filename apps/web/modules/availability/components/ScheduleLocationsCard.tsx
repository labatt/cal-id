"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { Select, TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { useMemo, useState } from "react";
import type { DayAssignment } from "./LocationMonthGrid";
import { LocationMonthGrid } from "./LocationMonthGrid";

/**
 * The location types a schedule location can take. Deliberately a short list rather than the
 * full app-store set: a schedule location has to be matchable against an event type's own
 * locations, and the types below are the ones that carry a stable discriminator (an address
 * or a credential) to match on.
 */
const LOCATION_TYPE_OPTIONS = [
  { value: "inPerson", labelKey: "in_person" },
  { value: "integrations:zoom", labelKey: "zoom_video" },
  { value: "integrations:google:meet", labelKey: "google_meet" },
  { value: "phone", labelKey: "phone_call" },
] as const;

type NewLocationDraft = {
  label: string;
  shortCode: string;
  type: string;
  address: string;
};

const EMPTY_DRAFT: NewLocationDraft = { label: "", shortCode: "", type: "inPerson", address: "" };

export const ScheduleLocationsCard = ({ scheduleId }: { scheduleId: number }) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(today.getUTCMonth());
  const [activeLocationId, setActiveLocationId] = useState<number | null>(null);
  const [draft, setDraft] = useState<NewLocationDraft>(EMPTY_DRAFT);
  const [isAdding, setIsAdding] = useState(false);

  const { data, isPending } = trpc.viewer.availability.scheduleLocations.list.useQuery({ scheduleId });

  const invalidate = () => utils.viewer.availability.scheduleLocations.list.invalidate({ scheduleId });

  const createLocation = trpc.viewer.availability.scheduleLocations.createLocation.useMutation({
    onSuccess: async (created) => {
      showToast(t("location_added"), "success");
      setDraft(EMPTY_DRAFT);
      setIsAdding(false);
      setActiveLocationId(created.id);
      await invalidate();
    },
    onError: (error) => showToast(error.message, "error"),
  });

  const deleteLocation = trpc.viewer.availability.scheduleLocations.deleteLocation.useMutation({
    onSuccess: async () => {
      showToast(t("location_removed"), "success");
      await invalidate();
    },
    onError: (error) => showToast(error.message, "error"),
  });

  const assignDate = trpc.viewer.availability.scheduleLocations.assignDate.useMutation({
    onSuccess: async () => invalidate(),
    onError: (error) => showToast(error.message, "error"),
  });

  const locations = useMemo(() => data?.locations ?? [], [data]);
  const rules = useMemo(() => data?.rules ?? [], [data]);

  const locationsById = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations]
  );

  /**
   * Only dated rules are painted onto the grid. Recurring rules are shown too, but marked as
   * inherited, so clicking a day is always understood as setting a one-off rather than
   * silently editing the weekday baseline underneath it.
   */
  const assignments = useMemo(() => {
    const byDate: Record<string, DayAssignment> = {};

    const recurringByWeekday = new Map<number, (typeof rules)[number]>();
    for (const rule of rules) {
      if (rule.date !== null) continue;
      for (const day of rule.days) {
        if (!recurringByWeekday.has(day)) recurringByWeekday.set(day, rule);
      }
    }

    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const cursor = new Date(Date.UTC(viewYear, viewMonth, day));
      const key = cursor.toISOString().slice(0, 10);
      const recurring = recurringByWeekday.get(cursor.getUTCDay());
      if (!recurring) continue;
      const location = locationsById.get(recurring.scheduleLocationId);
      if (!location) continue;
      byDate[key] = { shortCode: location.shortCode, label: location.label, isRecurring: true };
    }

    for (const rule of rules) {
      if (rule.date === null) continue;
      const location = locationsById.get(rule.scheduleLocationId);
      if (!location) continue;
      const key = new Date(rule.date).toISOString().slice(0, 10);
      byDate[key] = { shortCode: location.shortCode, label: location.label, isRecurring: false };
    }

    return byDate;
  }, [rules, locationsById, viewYear, viewMonth]);

  const handleDayClick = (dateKey: string) => {
    if (activeLocationId === null) {
      showToast(t("pick_a_location_first"), "warning");
      return;
    }
    const current = assignments[dateKey];
    const activeLocation = locationsById.get(activeLocationId);
    // Clicking a day that already carries the active location clears it, so the same click
    // both paints and erases and there is no separate delete mode to discover.
    const shouldClear =
      current && !current.isRecurring && activeLocation && current.shortCode === activeLocation.shortCode;

    assignDate.mutate({
      scheduleId,
      date: dateKey,
      scheduleLocationId: shouldClear ? null : activeLocationId,
    });
  };

  const typeOptions = LOCATION_TYPE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
  }));

  return (
    <div className="border-subtle bg-default mt-6 rounded-lg border p-6" data-testid="schedule-locations">
      <div className="mb-1">
        <h2 className="text-emphasis text-base font-semibold">{t("where_youll_be")}</h2>
        <p className="text-subtle text-sm">{t("where_youll_be_description")}</p>
      </div>

      <div className="mt-5">
        <h3 className="text-emphasis mb-2 text-sm font-medium">{t("your_locations")}</h3>

        {locations.length === 0 && !isPending ? (
          <p className="text-subtle text-sm">{t("no_locations_yet")}</p>
        ) : null}

        <ul className="stack-y-2">
          {locations.map((location) => (
            <li
              key={location.id}
              className="border-subtle flex items-center justify-between rounded-md border px-3 py-2">
              <button
                type="button"
                className="flex items-center gap-x-3 text-left"
                onClick={() => setActiveLocationId(location.id)}
                data-testid={`select-location-${location.id}`}>
                <Badge variant={activeLocationId === location.id ? "success" : "gray"}>
                  {location.shortCode}
                </Badge>
                <span className="text-emphasis text-sm">{location.label}</span>
                {location.address ? <span className="text-subtle text-xs">{location.address}</span> : null}
              </button>
              <Button
                type="button"
                variant="icon"
                color="destructive"
                StartIcon="trash"
                disabled={deleteLocation.isPending}
                aria-label={t("remove")}
                onClick={() => {
                  if (activeLocationId === location.id) setActiveLocationId(null);
                  deleteLocation.mutate({ scheduleId, locationId: location.id });
                }}
              />
            </li>
          ))}
        </ul>

        {isAdding ? (
          <div className="border-subtle mt-3 rounded-md border p-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <TextField
                label={t("label")}
                value={draft.label}
                placeholder="Benchmark, Tampa"
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              />
              <TextField
                label={t("short_code")}
                value={draft.shortCode}
                maxLength={4}
                placeholder="TPA"
                onChange={(event) => setDraft({ ...draft, shortCode: event.target.value })}
              />
            </div>
            <div className="mt-2">
              <label className="text-emphasis mb-1 block text-sm font-medium" htmlFor="location-type">
                {t("location")}
              </label>
              <Select
                inputId="location-type"
                options={typeOptions}
                value={typeOptions.find((option) => option.value === draft.type)}
                onChange={(option) => setDraft({ ...draft, type: option?.value ?? "inPerson" })}
              />
            </div>
            {draft.type === "inPerson" ? (
              <div className="mt-2">
                <TextField
                  label={t("address")}
                  value={draft.address}
                  onChange={(event) => setDraft({ ...draft, address: event.target.value })}
                />
              </div>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                disabled={createLocation.isPending}
                onClick={() =>
                  createLocation.mutate({
                    scheduleId,
                    label: draft.label,
                    shortCode: draft.shortCode,
                    type: draft.type,
                    address: draft.type === "inPerson" ? draft.address : null,
                  })
                }>
                {t("save")}
              </Button>
              <Button
                type="button"
                color="minimal"
                onClick={() => {
                  setDraft(EMPTY_DRAFT);
                  setIsAdding(false);
                }}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            color="secondary"
            StartIcon="plus"
            className="mt-3"
            onClick={() => setIsAdding(true)}>
            {t("add_location")}
          </Button>
        )}
      </div>

      <div className="border-subtle mt-6 border-t pt-5">
        <h3 className="text-emphasis mb-1 text-sm font-medium">{t("location_overrides")}</h3>
        <p className="text-subtle mb-3 text-sm">
          {activeLocationId === null
            ? `${t("location_overrides_description")} ${t("pick_a_location_then_click_days")}`
            : t("click_days_to_assign", { location: locationsById.get(activeLocationId)?.label ?? "" })}
        </p>
        <LocationMonthGrid
          year={viewYear}
          month={viewMonth}
          assignments={assignments}
          disabled={isPending || assignDate.isPending}
          onDayClick={handleDayClick}
          onMonthChange={(year, month) => {
            setViewYear(year);
            setViewMonth(month);
          }}
        />
      </div>
    </div>
  );
};
