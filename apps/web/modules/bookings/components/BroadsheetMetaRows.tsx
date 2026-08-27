"use client";

/**
 * BROADSHEET — the Duration / Where / Time zone rows that sit UNDER the calendar.
 *
 * In stock Cal-ID these controls live inside EventMeta, which is the left-hand
 * sidebar. The broadsheet layout promotes EventMeta to a full-width head band
 * (see config.ts), so these rows would have landed above the calendar. They are
 * rendered here instead, inside the `main` grid area beneath the DatePicker.
 *
 * This file is new and untracked, so the only cost upstream is the two-line
 * import + render in Booker.tsx.
 *
 * State is shared with the rest of the booker through the Zustand booker store,
 * so moving these controls does not change any behaviour: selecting a duration
 * here still drives slot fetching exactly as it did in the sidebar.
 */
import { useBookerStoreContext } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import { useBookerTime } from "@calcom/features/bookings/Booker/hooks/useBookerTime";
import { useTimePreferences } from "@calcom/features/bookings/lib";
import type { BookerEvent } from "@calcom/features/bookings/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { CURRENT_TIMEZONE } from "@calcom/lib/timezoneConstants";
import dynamic from "next/dynamic";
import { shallow } from "zustand/shallow";
import { AvailableEventLocations } from "./event-meta/AvailableEventLocations";
import { getDurationFormatted } from "./event-meta/Duration";
import { useSelectedDateLocation } from "./useScheduleDayBadges";

const TimezoneSelect = dynamic(
  () => import("@calcom/web/modules/timezone/components/TimezoneSelect").then((mod) => mod.TimezoneSelect),
  { ssr: false }
);

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <span className="bs-metarow-label">{label}</span>
    <div className="bs-metarow-value">{children}</div>
  </div>
);

export const BroadsheetMetaRows = ({
  event,
}: {
  event?: Pick<
    BookerEvent,
    "length" | "metadata" | "isDynamic" | "locations" | "lockTimeZoneToggleOnBookingPage" | "lockedTimeZone"
  > | null;
}) => {
  const { t } = useLocale();
  // Same accessors EventMeta uses: read the resolved timezone from useBookerTime,
  // and take only the setter off the preferences store so this component does not
  // re-render on every unrelated preference change.
  const { timezone } = useBookerTime();
  const [setTimezone] = useTimePreferences((state) => [state.setTimezone]);
  const [setBookerStoreTimezone] = useBookerStoreContext((state) => [state.setTimezone], shallow);
  const selectedDuration = useBookerStoreContext((state) => state.selectedDuration);
  const scheduleLocation = useSelectedDateLocation();

  if (!event) return null;

  const locked = event.lockTimeZoneToggleOnBookingPage;
  // Must mirror the render condition of the length band in EventMeta exactly, or
  // duration is either shown twice or not at all.
  const hasLengthBand =
    (!!event.metadata?.multipleDuration || !!event.isDynamic) &&
    !event.metadata?.hideDurationSelectorInBookingPage;

  return (
    <div className="bs-metarows" data-testid="broadsheet-meta-rows">
      {/* When the event offers a CHOICE of lengths, duration is not shown here at
          all — it was promoted into the full-width length band in the head
          (EventMeta row 4), because it gates which slots exist and so has to be
          read before the calendar rather than after it. Repeating it below would
          be redundant. A fixed-length event has no band, so it still states its
          length here as a plain fact alongside Where and Time zone. */}
      {!hasLengthBand && (
        <Row label={t("duration")}>{getDurationFormatted(selectedDuration || event.length, t)}</Row>
      )}

      {event.locations?.length ? (
        <Row label={t("where")}>
          {/* Once a slot is picked the schedule decides where it is, so the resolved location
              is stated outright. The radio field is hidden for a locked day — the location
              field carries hideWhenJustOneOption, so narrowing to one option removes it — and
              without this the booker would be told nothing at all. */}
          {scheduleLocation ? (
            <span className="flex flex-col">
              <span>{scheduleLocation.label}</span>
              {scheduleLocation.locked ? (
                <span className="text-subtle text-xs">{t("location_fixed_for_this_day")}</span>
              ) : null}
            </span>
          ) : (
            <AvailableEventLocations locations={event.locations} />
          )}
        </Row>
      ) : null}

      <Row label={t("timezone")}>
        {locked ? (
          <span>{event.lockedTimeZone || CURRENT_TIMEZONE}</span>
        ) : (
          // The web TimezoneSelect sources its own city list and takes
          // `timezones` (lowercase), not the `timeZones` shape EventMeta
          // forwards, so we let it use its default rather than pass a list.
          <TimezoneSelect
            menuPosition="absolute"
            value={timezone}
            onChange={({ value }) => {
              setTimezone(value);
              setBookerStoreTimezone(value);
            }}
            classNames={{
              control: () => "min-h-0! p-0 w-full border-0 bg-transparent focus-within:ring-0 shadow-none!",
              menu: () => "w-64! max-w-[90vw] mb-1",
              singleValue: () => "text-text py-0",
              indicatorsContainer: () => "ml-1",
              container: () => "max-w-full",
            }}
          />
        )}
      </Row>
    </div>
  );
};
