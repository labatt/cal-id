# Schedule Location Rules

**Date:** 2026-08-26
**Status:** Approved for implementation

## Problem

A booking's location is currently a single fixed choice: the event type lists
locations, and the attendee picks one. Where the organiser physically is has no
bearing on it.

That does not describe how this organiser works. They are at the Benchmark
office in Tampa roughly three days a week and at home in Miami the rest of the
time. Meetings booked for a Tampa day should be in person at that office;
meetings booked for a Miami day should be over Zoom. Which days are Tampa days
changes week to week — some weeks Monday through Wednesday, others Wednesday
through Friday. Thursdays in Tampa are half days.

Today the only way to express this is to change the event type by hand every
week, and the booker gets no warning at all: someone can book a Tuesday
expecting to drive to Tampa on a week the organiser is in Miami.

## Goals

- Let an organiser record where they are on given dates, and have bookings pick
  up the right location automatically.
- Make the location for a given day obvious to the booker **before** they commit
  to a slot, not as a surprise on the confirmation form.
- Allow a location to be either fixed for a day (no choice) or merely the
  default (attendee may still choose otherwise).
- Support any number of locations, not just two.
- Create the video meeting automatically when the resolved location is a
  conferencing app, exactly as if the attendee had chosen it.

## Non-goals

- Changing how event types define locations for organisers who do not opt in.
- Team or managed event types. Single-user schedules only in this iteration.
- Automatic travel detection or calendar-derived whereabouts. Rules are entered
  by hand.

## Decisions and why

### Rules live on the Schedule, not the event type

An earlier draft put these on the event type. That was wrong. The rules describe
where a **person** is, not how one meeting type behaves. At event-type scope,
every new event type needs its own copy of a travel calendar that changes weekly,
kept in sync by hand — and a missed edit means two event types contradicting each
other about the organiser's whereabouts.

Cost of the reversal: an event type that should ignore the rules needs an opt-out.
That is `EventType.useScheduleLocations`, defaulting to `false`, so nothing
existing changes behaviour.

### Dated rules and recurring rules, mirroring `Availability`

`Availability` already solves exactly this shape: a row is either a weekday
pattern (`days Int[]`) or a specific date (`date DateTime?`). Reusing that shape
means dated rules act as overrides over a recurring baseline, which is precisely
"most weeks vary, some have a pattern", and it reuses a model the codebase and
the user already understand.

### Nullable time bounds

Thursdays in Tampa are half days. Today that is masked — Thursday availability
happens to end at 12:00, so an all-day rule is accidentally correct — but it
becomes wrong the moment Thursday hours are extended. Rules describe where the
organiser is, independently of when they are bookable, so the half day is
encoded explicitly. `null` means all day.

### `position`, first match wins

An earlier draft dropped ordering on the promise that day sets would be
disjoint. Time ranges make disjointness both harder to enforce and less useful,
and a catch-all rule ("anything not listed is Zoom") must overlap by
definition. Explicit ordering with first-match-wins is predictable and gives a
drag-to-reorder editor for free. "Most specific wins" would be cleverer and
worse, because nobody can predict it.

### The event type must also list the location — OPEN CALL, RESOLVED

`getLocationValueForDB(locationBodyString, eventType.locations)` validates a
submitted location against the event type's array. A schedule location absent
from that array will not resolve, and the booking falls through to the default
conferencing app — in practice Cal Video — silently.

Two options were considered:

1. Require the event type to also list the location; validate on save.
2. Bypass that validation when `useScheduleLocations` is on and inject the
   schedule's location directly.

**Chosen: option 1.** Booking creation is the highest-risk path in the
application, and option 2 introduces a second way for a location to enter it.
Option 1 leaves `getLocationValueForDB` untouched: the schedule rule only
decides *which of the event type's existing locations* applies on a date.

The cost is one-time duplication — "Benchmark, Tampa" is defined on the schedule
and on the event type. The editor surfaces this as a warning rather than
silently producing an inert rule. If the duplication becomes painful across many
event types, option 2 is the upgrade path and this decision should be revisited.

### Matching a schedule location to an event-type location

By `type`, plus `address` for `inPerson` and `credentialId` for integrations.
Two `inPerson` entries are indistinguishable by type alone, which is the whole
reason Tampa forced this design. No match means the rule is **inert**: the
booking falls back to normal attendee choice rather than erroring. A booking
page that still works beats one that is correct-or-broken.

### Weekday and time are evaluated in the schedule's timezone

The schedule is `America/New_York`. A Friday 10:00 ET slot is Saturday 00:00 in
Sydney. If the weekday came from the booker's locale, an Australian booking a
Friday slot would match the Saturday rule — that is, no rule — and land on the
wrong location. "Thursday morning" means Thursday morning where the organiser
is.

## Data model

```prisma
model ScheduleLocation {
  id           Int      @id @default(autoincrement())
  schedule     Schedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  scheduleId   Int
  label        String   // "Benchmark, Tampa" — shown in the legend and band
  shortCode    String   // "TPA" — the calendar marker; 2-4 chars, unique per schedule
  type         String   // "inPerson" | "integrations:zoom" | ...
  address      String?
  credentialId Int?
  rules        ScheduleLocationRule[]

  @@index([scheduleId])
}

model ScheduleLocationRule {
  id                 Int              @id @default(autoincrement())
  schedule           Schedule         @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  scheduleId         Int
  location           ScheduleLocation @relation(fields: [scheduleLocationId], references: [id], onDelete: Cascade)
  scheduleLocationId Int
  position           Int
  date               DateTime?        @db.Date  // one-off; wins over weekday rules
  days               Int[]                      // recurring; 0=Sun..6=Sat
  startTime          DateTime?        @db.Time   // null = start of day
  endTime            DateTime?        @db.Time   // null = end of day
  locked             Boolean          @default(false)

  @@index([scheduleId, position])
}
```

Additions to existing models:

- `Schedule.locations ScheduleLocation[]` and `Schedule.locationRules ScheduleLocationRule[]`
- `EventType.useScheduleLocations Boolean @default(false)`

`ScheduleLocation` exists so the calendar editor has a fixed palette to assign
dates to, and so markers have a stable label. Without it, every rule would carry
a duplicate copy of an address.

## Resolution

A single pure function, given the rule set, a date-time, and the schedule
timezone:

```
resolveLocation(rules, locations, startTimeUtc, scheduleTimeZone)
  -> { location: ScheduleLocation, locked: boolean } | null
```

1. Convert `startTimeUtc` into the schedule timezone; take its date and weekday.
2. Consider dated rules matching that date first, then weekday rules whose
   `days` contains that weekday.
3. Within each group, take the lowest `position` whose `[startTime, endTime)`
   window contains the local time. Null bounds are open.
4. Return the first match, or `null` when nothing matches.

Being pure and timezone-explicit, this is directly unit-testable and is the same
function used by the booker, the booking endpoint, and the marker rendering — so
the three cannot disagree.

## Booker behaviour

The location field is a `radioInput` system field whose options are built in
`BookingFields.tsx` from `getLocationOptionsForSelect(locations, t)`. That is the
interception point.

| Resolved rule | Options shown | Value set |
| --- | --- | --- |
| `locked: true` | only the matched location | yes |
| `locked: false` | all event-type locations | yes, as default |
| none | all event-type locations | no (current behaviour) |

**The value must always be set.** `hideWhenJustOneOption` only marks the field
hidden; it never populates a value, and an empty `responses.location` yields
`locationValue = ""`, which lands in the default-conferencing-app path and can
end at Cal Video. Filtering options alone would silently produce the wrong
location.

## Display

Explicit per-location marking, driven by `ScheduleLocation.shortCode`:

- **Day cells** carry the short code when the whole day resolves to one
  location. When a day is mixed, the cell shows a mixed indicator (`··`) and the
  per-slot codes carry the real answer.
- **Timeslot buttons** carry the code for their own resolved location, so a
  mixed day is unambiguous at the point of choosing.
- **A location band** above the calendar. Before a date is selected it lists the
  distinct locations occurring in the visible month, as `shortCode — label`
  pairs; it does not attempt to render rules as prose, because arbitrary
  overlapping dated rules do not reduce to a readable sentence. Once a date is
  selected it states that date's resolved location, and whether it is fixed.
- **A legend** under the calendar maps every code in view to its label.

`shortCode` is author-supplied rather than derived. Deriving it from the label
collides ("Tampa" and "Tallahassee" both yield `TAL`/`TAM`-ish stems) and would
need disambiguation logic whose output the organiser cannot predict. The editor
suggests a default from the label's initials and lets it be overridden;
uniqueness within a schedule is enforced on save.

Marking is by code text, not colour alone: colour-only encoding fails under
common colour vision deficiencies, and this page's accent palette deliberately
spends its second accent exactly once.

## Server-side enforcement

Client-side filtering is advisory; the booking endpoint accepts whatever
`responses.location` is posted. Without a server check, a crafted request books
in person on a locked day.

Validation runs where the booked start time is known, resolving the rule for
that instant and rejecting a submitted location that contradicts a `locked`
rule. An inert rule — one whose location is not on the event type — does not
reject; it falls back to normal choice.

## Testing

- `resolveLocation` unit tests: dated over recurring; position ordering; open
  and closed time bounds; a slot on a DST boundary; a booker in a timezone whose
  local weekday differs from the schedule's.
- Matching tests: two `inPerson` entries distinguished by address; integration
  matched by `credentialId`; no match yields an inert rule.
- Booking-path tests: locked rule sets the value; unlocked rule sets a
  changeable default; no rule preserves today's behaviour; posting a location
  that contradicts a locked rule is rejected.
- Repository tests following the existing `*Repository.test.ts` convention.

## Delivery

Well past the 500-line / 10-file guidance, so it ships as a sequence. Nothing is
user-visible until step 3.

1. **Schema, repositories, resolution service.** Migration, both models, the
   `useScheduleLocations` flag, `resolveLocation` and its tests. No UI.
2. **Schedule location editor.** Manage `ScheduleLocation` entries; a month
   calendar for assigning dates; the event-type opt-in toggle and the
   missing-location warning.
3. **Booker resolution and server-side enforcement.** Option filtering, value
   setting, validation on submit.
4. **Markers.** Day codes, per-slot codes, band, legend.

## Risks

- **Booking creation is the riskiest path touched.** Confined to step 3, behind
  `useScheduleLocations`, which defaults off.
- **Timezone errors are silent and land people in the wrong city.** Mitigated by
  one shared pure function with explicit timezone tests.
- **An inert rule looks like a working one.** Mitigated by the editor warning;
  the fallback is safe but not obviously so to the organiser.
- **A deleted credential leaves a stale `credentialId`.** Matching then fails and
  the rule goes inert rather than misresolving. Acceptable.
