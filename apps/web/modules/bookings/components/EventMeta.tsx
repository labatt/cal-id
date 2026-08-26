import { Timezone as PlatformTimezoneSelect } from "@calcom/atoms/timezone";
import { useBookerStoreContext } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import { useBookerTime } from "@calcom/features/bookings/Booker/hooks/useBookerTime";
import { fadeInUp } from "@calcom/features/bookings/Booker/config";
import type { Timezone } from "@calcom/features/bookings/Booker/types";
import { FromToTime } from "@calcom/features/bookings/Booker/utils/dates";
import { useTimePreferences } from "@calcom/features/bookings/lib";
import type { BookerEvent } from "@calcom/features/bookings/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { markdownToSafeHTMLClient } from "@calcom/lib/markdownToSafeHTMLClient";
import { CURRENT_TIMEZONE } from "@calcom/lib/timezoneConstants";
import type { EventTypeTranslation } from "@calcom/prisma/client";
import { EventTypeAutoTranslatedField } from "@calcom/prisma/enums";
import { BookerLayouts } from "@calcom/prisma/zod-utils";
import { EventMetaBlock } from "@calcom/web/modules/bookings/components/event-meta/Details";
import { SeatsAvailabilityText } from "@calcom/web/modules/bookings/components/SeatsAvailabilityText";
import { m } from "framer-motion";
import dynamic from "next/dynamic";
import { useEffect, useMemo } from "react";
import { shallow } from "zustand/shallow";
import i18nConfigration from "../../../../../i18n.json";
import { EventDetails, EventMembers, EventMetaSkeleton, EventTitle } from "./event-meta";
import { EventDuration } from "./event-meta/Duration";
import { ScrollableWithGradients } from "./ScrollableWithGradients";

const WebTimezoneSelect = dynamic(
  () => import("@calcom/web/modules/timezone/components/TimezoneSelect").then((mod) => mod.TimezoneSelect),
  {
    ssr: false,
  }
);

const getTranslatedField = (
  translations: Array<Pick<EventTypeTranslation, "field" | "targetLocale" | "translatedText">>,
  field: EventTypeAutoTranslatedField,
  userLocale: string
) => {
  const i18nLocales = i18nConfigration.locale.targets.concat([i18nConfigration.locale.source]);

  return translations?.find(
    (trans) =>
      trans.field === field &&
      i18nLocales.includes(trans.targetLocale) &&
      (userLocale === trans.targetLocale || userLocale.split("-")[0] === trans.targetLocale)
  )?.translatedText;
};

export const EventMeta = ({
  event,
  isPending,
  isPlatform = true,
  isPrivateLink,
  classNames,
  locale,
  timeZones,
  children,
  selectedTimeslot,
  roundRobinHideOrgAndTeam,
  hideOrgTeamAvatar,
  hideEventTypeDetails = false,
}: {
  event?: Pick<
    BookerEvent,
    | "lockTimeZoneToggleOnBookingPage"
    | "lockedTimeZone"
    | "schedule"
    | "seatsPerTimeSlot"
    | "subsetOfUsers"
    | "length"
    | "schedulingType"
    | "profile"
    | "entity"
    | "description"
    | "title"
    | "metadata"
    | "locations"
    | "currency"
    | "requiresConfirmation"
    | "recurringEvent"
    | "price"
    | "isDynamic"
    | "fieldTranslations"
    | "autoTranslateDescriptionEnabled"
    | "enablePerHostLocations"
  > | null;
  isPending: boolean;
  isPrivateLink: boolean;
  isPlatform?: boolean;
  classNames?: {
    eventMetaContainer?: string;
    eventMetaTitle?: string;
    eventMetaTimezoneSelect?: string;
    eventMetaChildren?: string;
  };
  locale?: string | null;
  timeZones?: Timezone[];
  children?: React.ReactNode;
  selectedTimeslot: string | null;
  roundRobinHideOrgAndTeam?: boolean;
  hideOrgTeamAvatar?: boolean;
  hideEventTypeDetails?: boolean;
}) => {
  const { timeFormat, timezone } = useBookerTime();
  const [setTimezone] = useTimePreferences((state) => [state.setTimezone]);
  const [setBookerStoreTimezone] = useBookerStoreContext((state) => [state.setTimezone], shallow);
  const selectedDuration = useBookerStoreContext((state) => state.selectedDuration);
  const bookerState = useBookerStoreContext((state) => state.state);
  // BROADSHEET: the newsprint head band applies to month_view ONLY.
  // week_view and column_view keep the stock sidebar, including the duration,
  // location and timezone controls that month_view moves under the calendar.
  const bookerLayout = useBookerStoreContext((state) => state.layout);
  const isBroadsheet = bookerLayout === BookerLayouts.MONTH_VIEW;
  const bookingData = useBookerStoreContext((state) => state.bookingData);
  const rescheduleUid = useBookerStoreContext((state) => state.rescheduleUid);
  const [seatedEventData, setSeatedEventData] = useBookerStoreContext(
    (state) => [state.seatedEventData, state.setSeatedEventData],
    shallow
  );
  const { i18n, t } = useLocale();
  const [TimezoneSelect] = useMemo(
    () => (isPlatform ? [PlatformTimezoneSelect] : [WebTimezoneSelect]),
    [isPlatform]
  );

  useEffect(() => {
    //In case the event has lockTimeZone enabled ,set the timezone to event's locked timezone
    if (event?.lockTimeZoneToggleOnBookingPage) {
      const timezone = event.lockedTimeZone || event.schedule?.timeZone;
      if (timezone) {
        setTimezone(timezone);
      }
    }
  }, [event, setTimezone]);

  if (hideEventTypeDetails) {
    return null;
  }
  // If we didn't pick a time slot yet, we load bookingData via SSR so bookingData should be set
  // Otherwise we load seatedEventData from useBookerStore
  const bookingSeatAttendeesQty = seatedEventData?.attendees || bookingData?.attendees.length;
  const eventTotalSeats = seatedEventData?.seatsPerTimeSlot || event?.seatsPerTimeSlot;

  const isHalfFull =
    bookingSeatAttendeesQty && eventTotalSeats && bookingSeatAttendeesQty / eventTotalSeats >= 0.5;
  const isNearlyFull =
    bookingSeatAttendeesQty && eventTotalSeats && bookingSeatAttendeesQty / eventTotalSeats >= 0.83;

  const colorClass = isNearlyFull
    ? "text-rose-600"
    : isHalfFull
      ? "text-yellow-500"
      : "text-bookinghighlight";
  const userLocale = locale ?? navigator.language;
  const translatedDescription = getTranslatedField(
    event?.fieldTranslations ?? [],
    EventTypeAutoTranslatedField.DESCRIPTION,
    userLocale
  );
  const translatedTitle = getTranslatedField(
    event?.fieldTranslations ?? [],
    EventTypeAutoTranslatedField.TITLE,
    userLocale
  );

  // BROADSHEET: split the description into a one-line lead plus optional long
  // detail. By convention the FIRST line of the description is the lead, so the
  // no-wrap line is authored copy rather than truncated prose — anything after
  // the first blank line is demoted to a "Details" disclosure under the
  // calendar. Falling back to the whole description keeps single-line
  // descriptions (the common case) working untouched.
  const rawDescription = translatedDescription ?? event?.description ?? "";
  const [leadSource, ...restSource] = rawDescription.split(/\n\s*\n/);
  const leadHtml = leadSource ? markdownToSafeHTMLClient(leadSource) : "";
  const detailHtml = restSource.length ? markdownToSafeHTMLClient(restSource.join("\n\n")) : "";

  return (
    <div
      className={`${classNames?.eventMetaContainer || ""} ${isBroadsheet ? "bs-head" : ""} relative z-10 p-6`}
      data-testid="event-meta">
      {isPending && (
        <m.div {...fadeInUp} initial="visible" layout>
          <EventMetaSkeleton />
        </m.div>
      )}
      {!isPending && !!event && (
        <m.div {...fadeInUp} layout transition={{ ...fadeInUp.transition, delay: 0.3 }}>
          {isBroadsheet && (
            <>
          {/* Row 1 — byline */}
          <div className="bs-byline">
            <EventMembers
              schedulingType={event.schedulingType}
              users={event.subsetOfUsers}
              profile={event.profile}
              entity={event.entity}
              isPrivateLink={isPrivateLink}
              roundRobinHideOrgAndTeam={roundRobinHideOrgAndTeam}
              hideOrgTeamAvatar={hideOrgTeamAvatar}
            />
          </div>

          {/* Row 2 — the standing head */}
          <div className="bs-title-band">
            <EventTitle className={`${classNames?.eventMetaTitle} bs-title`}>
              {translatedTitle ?? event?.title}
            </EventTitle>
          </div>

          {/* Row 3 — the lead band. The only magenta on the page. */}
          {leadHtml && (
            <div className="bs-lead-band" data-testid="event-meta-description">
              <span className="bs-lead-kicker">{t("read_first", "Read first")}</span>
              {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Content is sanitized via markdownToSafeHTMLClient */}
              <div className="bs-lead-line" title={leadSource} dangerouslySetInnerHTML={{ __html: leadHtml }} />
            </div>
          )}

          {/* Row 4 — the length bar. Duration is the highest-consequence choice
              on the page: changing it refetches every slot, so it has to be read
              BEFORE a date is picked. In stock Cal-ID it is one line of a sidebar
              detail list; here it is a full-sheet band directly under the lead.
              EventDuration self-suppresses when the event has a single length or
              the organiser hid the selector, so this band renders nothing in
              those cases rather than showing an empty control. */}
          {(event.metadata?.multipleDuration || event.isDynamic) &&
            !event.metadata?.hideDurationSelectorInBookingPage && (
              <div className="bs-length-band" data-testid="broadsheet-length-band">
                <span className="bs-length-kicker">{t("duration")}</span>
                <div className="bs-length-control">
                  <EventDuration event={event} />
                </div>
              </div>
            )}

          {/* Long-form detail, if the description had more than one paragraph. */}
          {detailHtml && (
            <details className="bs-details">
              <summary>{t("additional_notes", "Details")}</summary>
              {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Content is sanitized via markdownToSafeHTMLClient */}
              <div className="bs-details-body" dangerouslySetInnerHTML={{ __html: detailHtml }} />
            </details>
          )}
            </>
          )}

          {!isBroadsheet && (
            <>
              <EventMembers
                schedulingType={event.schedulingType}
                users={event.subsetOfUsers}
                profile={event.profile}
                entity={event.entity}
                isPrivateLink={isPrivateLink}
                roundRobinHideOrgAndTeam={roundRobinHideOrgAndTeam}
                hideOrgTeamAvatar={hideOrgTeamAvatar}
              />
              <EventTitle className={`${classNames?.eventMetaTitle} my-2`}>
                {translatedTitle ?? event?.title}
              </EventTitle>
              {(event.description || translatedDescription) && (
                <EventMetaBlock data-testid="event-meta-description" contentClassName="mb-8">
                  <ScrollableWithGradients
                    className="wrap-break-word scroll-bar max-h-[180px] max-w-full overflow-y-auto pr-4"
                    ariaLabel={t("description")}>
                    {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Content is sanitized via markdownToSafeHTMLClient */}
                    <div
                      dangerouslySetInnerHTML={{
                        __html: markdownToSafeHTMLClient(translatedDescription ?? event.description),
                      }}
                    />
                  </ScrollableWithGradients>
                </EventMetaBlock>
              )}
            </>
          )}
          {/* BROADSHEET: duration / location / timezone now render in
              BroadsheetMetaRows under the calendar. What remains here is
              contextual booking state (former time, chosen slot, seats). */}
          <div className="stack-y-4 font-medium rtl:-mr-2">
            {rescheduleUid && bookingData && (
              <EventMetaBlock icon="calendar">
                {t("former_time")}
                <br />
                <span className="line-through" data-testid="former_time_p">
                  <FromToTime
                    date={bookingData.startTime.toString()}
                    duration={null}
                    timeFormat={timeFormat}
                    timeZone={timezone}
                    language={i18n.language}
                  />
                </span>
              </EventMetaBlock>
            )}
            {selectedTimeslot && (
              <EventMetaBlock icon="calendar">
                <FromToTime
                  date={selectedTimeslot}
                  duration={selectedDuration || event.length}
                  timeFormat={timeFormat}
                  timeZone={timezone}
                  language={i18n.language}
                />
              </EventMetaBlock>
            )}
            {!isBroadsheet && <EventDetails event={event} />}
            {!isBroadsheet && (
              <EventMetaBlock
                className="cursor-pointer [&_.current-timezone:before]:focus-within:opacity-100 [&_.current-timezone:before]:hover:opacity-100"
                contentClassName="relative max-w-[90%]"
                icon="globe">
                {bookerState === "booking" ? (
                  <>{timezone}</>
                ) : (
                  <span
                    className={`current-timezone before:bg-subtle min-w-32 -mt-[2px] flex h-6 max-w-full items-center justify-start before:absolute before:inset-0 before:bottom-[-3px] before:left-[-30px] before:top-[-3px] before:w-[calc(100%+35px)] before:rounded-md before:py-3 before:opacity-0 before:transition-opacity ${
                      event.lockTimeZoneToggleOnBookingPage ? "cursor-not-allowed" : ""
                    }`}
                    data-testid="event-meta-current-timezone">
                    <TimezoneSelect
                      timeZones={timeZones}
                      menuPosition="absolute"
                      timezoneSelectCustomClassname={classNames?.eventMetaTimezoneSelect}
                      classNames={{
                        control: () =>
                          "min-h-0! p-0 w-full border-0 bg-transparent focus-within:ring-0 shadow-none!",
                        menu: () => "w-64! max-w-[90vw] mb-1 ",
                        singleValue: () => "text-text py-1",
                        indicatorsContainer: () => "ml-auto",
                        container: () => "max-w-full",
                      }}
                      value={
                        event.lockTimeZoneToggleOnBookingPage
                          ? event.lockedTimeZone || CURRENT_TIMEZONE
                          : timezone
                      }
                      onChange={({ value }) => {
                        setTimezone(value);
                        setBookerStoreTimezone(value);
                      }}
                      isDisabled={event.lockTimeZoneToggleOnBookingPage}
                    />
                  </span>
                )}
              </EventMetaBlock>
            )}
            {bookerState === "booking" && eventTotalSeats && bookingSeatAttendeesQty ? (
              <EventMetaBlock icon="user" className={`${colorClass}`}>
                <div className="text-bookinghighlight flex items-start text-sm">
                  <p>
                    <SeatsAvailabilityText
                      showExact={!!seatedEventData.showAvailableSeatsCount}
                      totalSeats={eventTotalSeats}
                      bookedSeats={bookingSeatAttendeesQty || 0}
                      variant="fraction"
                    />
                  </p>
                </div>
              </EventMetaBlock>
            ) : null}
          </div>
          {children && <div className={classNames?.eventMetaChildren}>{children}</div>}
        </m.div>
      )}
    </div>
  );
};
