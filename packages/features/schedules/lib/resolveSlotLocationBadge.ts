import { type LocationRule, resolveLocation } from "./resolveLocation";

export type BadgeLocation = {
  id: number;
  shortCode: string;
  compactCode: string | null;
  label: string;
};

export type SlotLocationBadge = {
  /** Full code, for the room a desktop slot button has. */
  text: string;
  /** Narrow-screen form; absent when it would be identical to `text`. */
  compactText?: string;
  /** Spelled-out location, for the accessible name and the tooltip. */
  title: string;
};

/**
 * The location marker for one timeslot.
 *
 * Resolution is per instant, not per day: a day whose morning and afternoon differ has no
 * single answer, and the slot list is the one surface that can show which is which. The day
 * cell falls back to a mixed marker precisely because it cannot.
 *
 * The marker names what the booker can actually end up with, which is not the same as what
 * the schedule prefers. Only a locked rule removes the choice, so only a locked rule yields a
 * single code; an unlocked rule and no rule at all both leave every location reachable and are
 * listed in full, default first. Naming just the default would tell a booker they cannot
 * change something they can.
 */
export function resolveSlotLocationBadge({
  locations,
  rules,
  startTime,
  scheduleTimeZone,
}: {
  locations: BadgeLocation[];
  rules: LocationRule[];
  startTime: Date;
  scheduleTimeZone: string;
}): SlotLocationBadge | null {
  if (locations.length === 0) return null;
  if (Number.isNaN(startTime.getTime())) return null;

  const resolved = resolveLocation({ rules, startTime, scheduleTimeZone });

  if (resolved) {
    const location = locations.find((candidate) => candidate.id === resolved.scheduleLocationId);
    // A rule pointing at a location the caller did not load is a stale rule, and inventing a
    // marker for it would be worse than leaving the slot unmarked.
    if (!location) return null;

    // A locked rule is the only case where the booker genuinely has no say.
    if (resolved.locked) return toBadge([location]);

    // An unlocked rule is a default, not a decision: the booker may still pick any of the
    // others, and a marker naming only the default would overstate it. The default leads the
    // list so it stays legible as the likely answer.
    return toBadge([location, ...locations.filter((candidate) => candidate.id !== location.id)]);
  }

  return toBadge(locations);
}

const toBadge = (locations: BadgeLocation[]): SlotLocationBadge => {
  const text = locations.map((location) => location.shortCode).join(" / ");
  // No spaces in the compact form: a phone-width slot button already carries a time, and
  // "TP/ZM" fits where "TP / ZM" begins to wrap.
  const compactText = locations.map((location) => location.compactCode || location.shortCode).join("/");

  return {
    text,
    compactText: compactText === text ? undefined : compactText,
    title: locations.map((location) => location.label).join(" or "),
  };
};
