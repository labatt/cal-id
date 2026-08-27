"use client";

import type { LocationObject } from "@calcom/app-store/locations";
import { useIsPlatform } from "@calcom/atoms/hooks/useIsPlatform";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { MapPinIcon } from "@coss/ui/icons";

import { useSelectedDateLocation } from "../useScheduleDayBadges";
import { AvailableEventLocations } from "./AvailableEventLocations";

/**
 * The location the schedule resolves for the selected day, falling back to the event type's
 * full list when no rule applies.
 *
 * Every layout needs this, not only the desktop meta rows. On a locked day the booking form's
 * location field is hidden — it carries hideWhenJustOneOption, and narrowing to one option
 * removes it — so a layout still printing "2 location options" tells the booker nothing about
 * where they are actually going.
 *
 * showIcon exists because the two call sites differ in chrome rather than content: the meta
 * blocks lead each row with an icon, the broadsheet rows lead with a text label.
 */
export const ScheduleAwareLocations = ({
  locations,
  showIcon = false,
}: {
  locations: LocationObject[];
  showIcon?: boolean;
}) => {
  const { t } = useLocale();
  const isPlatform = useIsPlatform();
  const scheduleLocation = useSelectedDateLocation();

  if (!scheduleLocation) return <AvailableEventLocations locations={locations} />;

  return (
    <div className="flex flex-row items-start text-sm font-medium">
      {showIcon ? (
        isPlatform ? (
          <MapPinIcon className="me-[10px] mt-0.5 h-4 w-4 opacity-70 dark:invert" />
        ) : (
          <img
            src="/map-pin-dark.svg"
            className="me-[10px] mt-0.5 h-4 w-4 opacity-70 dark:invert"
            alt="map-pin"
          />
        )
      ) : null}
      <span className="flex flex-col">
        <span>{scheduleLocation.label}</span>
        {scheduleLocation.locked ? (
          <span className="text-subtle text-xs font-normal">{t("location_fixed_for_this_day")}</span>
        ) : null}
      </span>
    </div>
  );
};
