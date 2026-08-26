"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import classNames from "@calcom/ui/classNames";
import { Button } from "@calcom/ui/components/button";

/**
 * All date arithmetic here is done in UTC and dates are keyed as YYYY-MM-DD strings.
 *
 * A grid built from local-time Dates renders a different set of cells depending on the
 * viewer's offset, and the key for "the 8th" would not match the key the server stored.
 * Since these cells are calendar days rather than instants, UTC is simply the arithmetic
 * that has no offset to get wrong.
 */
export const toDateKey = (year: number, month: number, day: number): string =>
  `${year.toString().padStart(4, "0")}-${(month + 1).toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;

const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export type DayAssignment = {
  shortCode: string;
  label: string;
  isRecurring: boolean;
};

export const LocationMonthGrid = ({
  year,
  month,
  assignments,
  onDayClick,
  onMonthChange,
  disabled = false,
}: {
  year: number;
  month: number;
  /** Keyed by YYYY-MM-DD. */
  assignments: Record<string, DayAssignment>;
  onDayClick: (dateKey: string) => void;
  onMonthChange: (year: number, month: number) => void;
  disabled?: boolean;
}) => {
  const { t, i18n } = useLocale();

  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leadingBlanks = firstOfMonth.getUTCDay();

  const monthLabel = new Intl.DateTimeFormat(i18n.language, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(firstOfMonth);

  const step = (delta: number) => {
    const shifted = new Date(Date.UTC(year, month + delta, 1));
    onMonthChange(shifted.getUTCFullYear(), shifted.getUTCMonth());
  };

  return (
    <div data-testid="location-month-grid">
      <div className="mb-3 flex items-center justify-between">
        <Button
          type="button"
          variant="icon"
          color="minimal"
          StartIcon="chevron-left"
          disabled={disabled}
          aria-label={t("view_previous_month")}
          onClick={() => step(-1)}
        />
        <span className="text-emphasis text-sm font-semibold">{monthLabel}</span>
        <Button
          type="button"
          variant="icon"
          color="minimal"
          StartIcon="chevron-right"
          disabled={disabled}
          aria-label={t("view_next_month")}
          onClick={() => step(1)}
        />
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_KEYS.map((key) => (
          <div key={key} className="text-subtle pb-1 text-center text-xs font-medium uppercase">
            {t(key).slice(0, 2)}
          </div>
        ))}

        {Array.from({ length: leadingBlanks }, (_, index) => (
          <div key={`blank-${index}`} />
        ))}

        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const dateKey = toDateKey(year, month, day);
          const assignment = assignments[dateKey];
          return (
            <button
              key={dateKey}
              type="button"
              disabled={disabled}
              onClick={() => onDayClick(dateKey)}
              data-testid={`location-day-${dateKey}`}
              aria-label={
                assignment ? `${day} — ${assignment.label}` : `${day} — ${t("no_location_assigned")}`
              }
              aria-pressed={!!assignment && !assignment.isRecurring}
              className={classNames(
                "border-subtle relative flex aspect-square flex-col items-center justify-center rounded-md border text-sm transition",
                disabled ? "cursor-not-allowed opacity-60" : "hover:border-emphasis",
                assignment && !assignment.isRecurring
                  ? "bg-inverted text-inverted border-transparent font-semibold"
                  : "bg-default text-emphasis"
              )}>
              <span>{day}</span>
              {assignment ? (
                <span
                  className={classNames(
                    "mt-0.5 text-[9px] font-bold leading-none tracking-wide",
                    // A rule inherited from the weekday baseline is shown in a lighter
                    // treatment than one set explicitly on this date, so it is obvious which
                    // days were actually clicked and which are just following the pattern.
                    assignment.isRecurring ? "text-subtle" : "text-inverted"
                  )}>
                  {assignment.shortCode}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
};
