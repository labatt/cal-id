# Schedule Location Rules — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist where an organiser physically is on given dates, and resolve a booking instant to exactly one location — with no UI and no change to any existing booking.

**Architecture:** Two additive Prisma models hang off `Schedule`: `ScheduleLocation` (the places, each with a short marker code) and `ScheduleLocationRule` (when you are there, mirroring `Availability`'s `days[]`-or-`date` shape). A pure `resolveLocation` function maps a UTC instant plus the schedule's timezone to at most one rule. A second pure function matches a resolved `ScheduleLocation` against an event type's existing `locations` array, so booking creation stays untouched in later phases.

**Tech Stack:** TypeScript (strict), Prisma 6.16 / PostgreSQL, Vitest, dayjs (`@calcom/dayjs`, with the timezone plugin already loaded).

**Spec:** `docs/superpowers/specs/2026-08-26-schedule-location-rules-design.md`

## Global Constraints

- Use `select`, never `include`, in Prisma queries.
- Use `import type { X }` for type-only imports; import from source files, never barrel `index.ts`.
- No `as any`. Ever.
- Repositories contain data access only — no business logic. Resolution lives in `lib/`.
- `packages/features/**` must not import from `@calcom/trpc`.
- Errors in non-tRPC files use `ErrorWithCode` from `@calcom/lib/errors`.
- Weekday numbering is `0=Sunday … 6=Saturday`, matching `Availability.days`.
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`.
- Run `TZ=UTC yarn vitest run <path>` for unit tests; timezone-dependent suites live in `*.timezone.test.ts`, which the workspace re-runs under several `TZ` values.
- Nothing in this phase may change behaviour for an event type that has not opted in. `EventType.useScheduleLocations` defaults to `false`.

---

### Task 1: Schema and migration

**Files:**
- Modify: `packages/prisma/schema.prisma` (model `Schedule` ~945-958, model `EventType` ~157-190)
- Create: `packages/prisma/migrations/20260826000000_add_schedule_location_rules/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma models `ScheduleLocation` and `ScheduleLocationRule`; field `EventType.useScheduleLocations: boolean`.

- [ ] **Step 1: Add both models to `schema.prisma`**

Append after the `Availability` model:

```prisma
model ScheduleLocation {
  id           Int                    @id @default(autoincrement())
  schedule     Schedule               @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  scheduleId   Int
  label        String
  shortCode    String
  type         String
  address      String?
  credentialId Int?
  rules        ScheduleLocationRule[]

  @@unique([scheduleId, shortCode])
  @@index([scheduleId])
}

model ScheduleLocationRule {
  id                 Int              @id @default(autoincrement())
  schedule           Schedule         @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  scheduleId         Int
  location           ScheduleLocation @relation(fields: [scheduleLocationId], references: [id], onDelete: Cascade)
  scheduleLocationId Int
  position           Int
  date               DateTime?        @db.Date
  days               Int[]
  startTime          DateTime?        @db.Time
  endTime            DateTime?        @db.Time
  locked             Boolean          @default(false)

  @@index([scheduleId, position])
  @@index([scheduleLocationId])
}
```

- [ ] **Step 2: Add the reverse relations and the opt-in flag**

In `model Schedule`, after `availability Availability[]`:

```prisma
  locations            ScheduleLocation[]
  locationRules        ScheduleLocationRule[]
```

In `model EventType`, after `locations Json?`:

```prisma
  useScheduleLocations Boolean @default(false)
```

- [ ] **Step 3: Generate the migration SQL without applying it**

Run: `yarn prisma migrate dev --create-only --name add_schedule_location_rules --schema packages/prisma/schema.prisma`
Expected: a new folder under `packages/prisma/migrations/` containing `migration.sql`.

- [ ] **Step 4: Read the generated SQL and confirm it is additive only**

Run: `cat packages/prisma/migrations/*add_schedule_location_rules/migration.sql`
Expected: only `CREATE TABLE`, `CREATE INDEX`, `CREATE UNIQUE INDEX`, `ALTER TABLE "EventType" ADD COLUMN`, and `ADD CONSTRAINT ... FOREIGN KEY`.
**Stop if any `DROP`, `ALTER COLUMN`, or `NOT NULL` without a default appears** — this migration runs against a live database with real bookings.

- [ ] **Step 5: Apply the migration**

Run: `yarn workspace @calcom/prisma db-deploy`
Expected: `The following migration(s) have been applied`.

- [ ] **Step 6: Regenerate the Prisma client**

Run: `yarn prisma generate`
Expected: completes without error; `ScheduleLocation` is now a known model.

- [ ] **Step 7: Verify the tables exist and existing data is untouched**

Run:
```bash
psql "$DATABASE_URL" -c '\d "ScheduleLocationRule"'
psql "$DATABASE_URL" -c 'SELECT count(*) FROM "Booking";'
psql "$DATABASE_URL" -c 'SELECT id, "useScheduleLocations" FROM "EventType";'
```
Expected: the table description prints; the booking count is unchanged from before the migration; every event type shows `f`.

- [ ] **Step 8: Commit**

```bash
git add packages/prisma/schema.prisma packages/prisma/migrations
git commit -m "feat(schedules): add schedule location and location rule models"
```

---

### Task 2: `resolveLocation` — non-timezone behaviour

**Files:**
- Create: `packages/features/schedules/lib/resolveLocation.ts`
- Test: `packages/features/schedules/lib/resolveLocation.test.ts`

**Interfaces:**
- Consumes: Prisma types from Task 1.
- Produces:
  ```ts
  export type LocationRule = {
    id: number;
    position: number;
    date: Date | null;
    days: number[];
    startTime: Date | null;
    endTime: Date | null;
    locked: boolean;
    scheduleLocationId: number;
  };
  export type ResolvedLocation = { scheduleLocationId: number; locked: boolean; ruleId: number };
  export function resolveLocation(args: {
    rules: LocationRule[];
    startTime: Date;          // the booking instant, UTC
    scheduleTimeZone: string; // e.g. "America/New_York"
  }): ResolvedLocation | null;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { resolveLocation, type LocationRule } from "./resolveLocation";

const TZ = "America/New_York";

const rule = (over: Partial<LocationRule> & { id: number; scheduleLocationId: number }): LocationRule => ({
  position: 0,
  date: null,
  days: [],
  startTime: null,
  endTime: null,
  locked: false,
  ...over,
});

// 2026-09-08 is a Tuesday; 14:00Z is 10:00 in New York.
const tueMorning = new Date("2026-09-08T14:00:00Z");
const thuAfternoon = new Date("2026-09-10T18:00:00Z"); // 14:00 New York

describe("resolveLocation", () => {
  it("returns null when no rule matches", () => {
    expect(resolveLocation({ rules: [], startTime: tueMorning, scheduleTimeZone: TZ })).toBeNull();
  });

  it("matches a weekday rule containing the local weekday", () => {
    const rules = [rule({ id: 1, scheduleLocationId: 7, days: [2, 3] })];
    expect(resolveLocation({ rules, startTime: tueMorning, scheduleTimeZone: TZ })).toEqual({
      scheduleLocationId: 7,
      locked: false,
      ruleId: 1,
    });
  });

  it("ignores a weekday rule that does not contain the local weekday", () => {
    const rules = [rule({ id: 1, scheduleLocationId: 7, days: [5] })];
    expect(resolveLocation({ rules, startTime: tueMorning, scheduleTimeZone: TZ })).toBeNull();
  });

  it("treats empty days as every day", () => {
    const rules = [rule({ id: 1, scheduleLocationId: 9, days: [] })];
    expect(resolveLocation({ rules, startTime: tueMorning, scheduleTimeZone: TZ })?.scheduleLocationId).toBe(9);
  });

  it("prefers a dated rule over a weekday rule", () => {
    const rules = [
      rule({ id: 1, scheduleLocationId: 7, days: [2], position: 0 }),
      rule({ id: 2, scheduleLocationId: 8, date: new Date("2026-09-08T00:00:00Z"), position: 1 }),
    ];
    expect(resolveLocation({ rules, startTime: tueMorning, scheduleTimeZone: TZ })?.scheduleLocationId).toBe(8);
  });

  it("uses position order within dated rules", () => {
    const d = new Date("2026-09-08T00:00:00Z");
    const rules = [
      rule({ id: 2, scheduleLocationId: 8, date: d, position: 5 }),
      rule({ id: 3, scheduleLocationId: 9, date: d, position: 1 }),
    ];
    expect(resolveLocation({ rules, startTime: tueMorning, scheduleTimeZone: TZ })?.ruleId).toBe(3);
  });

  it("respects a closed time window", () => {
    const rules = [
      rule({
        id: 1,
        scheduleLocationId: 7,
        days: [4],
        startTime: new Date("1970-01-01T00:00:00Z"),
        endTime: new Date("1970-01-01T12:00:00Z"),
      }),
    ];
    // 14:00 local on Thursday is outside 00:00-12:00
    expect(resolveLocation({ rules, startTime: thuAfternoon, scheduleTimeZone: TZ })).toBeNull();
  });

  it("treats the window end as exclusive and the start as inclusive", () => {
    const noonThu = new Date("2026-09-10T16:00:00Z"); // 12:00 New York
    const rules = [
      rule({
        id: 1,
        scheduleLocationId: 7,
        days: [4],
        startTime: new Date("1970-01-01T09:30:00Z"),
        endTime: new Date("1970-01-01T12:00:00Z"),
      }),
    ];
    expect(resolveLocation({ rules, startTime: noonThu, scheduleTimeZone: TZ })).toBeNull();
    const halfTen = new Date("2026-09-10T13:30:00Z"); // 09:30 New York
    expect(resolveLocation({ rules, startTime: halfTen, scheduleTimeZone: TZ })?.ruleId).toBe(1);
  });

  it("carries the locked flag through", () => {
    const rules = [rule({ id: 1, scheduleLocationId: 7, days: [2], locked: true })];
    expect(resolveLocation({ rules, startTime: tueMorning, scheduleTimeZone: TZ })?.locked).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TZ=UTC yarn vitest run packages/features/schedules/lib/resolveLocation.test.ts`
Expected: FAIL — `Failed to resolve import "./resolveLocation"`.

- [ ] **Step 3: Write the implementation**

```ts
import dayjs from "@calcom/dayjs";

export type LocationRule = {
  id: number;
  position: number;
  date: Date | null;
  days: number[];
  startTime: Date | null;
  endTime: Date | null;
  locked: boolean;
  scheduleLocationId: number;
};

export type ResolvedLocation = {
  scheduleLocationId: number;
  locked: boolean;
  ruleId: number;
};

/**
 * Prisma returns @db.Time as a Date pinned to 1970-01-01 UTC, so the wall-clock
 * time lives in the UTC fields rather than the local ones. Reading it any other
 * way silently shifts every window by the server's offset.
 */
const minutesFromTimeColumn = (value: Date): number => value.getUTCHours() * 60 + value.getUTCMinutes();

const matchesWindow = (rule: LocationRule, localMinutes: number): boolean => {
  const from = rule.startTime ? minutesFromTimeColumn(rule.startTime) : 0;
  const to = rule.endTime ? minutesFromTimeColumn(rule.endTime) : 24 * 60;
  return localMinutes >= from && localMinutes < to;
};

const byPosition = (a: LocationRule, b: LocationRule): number => a.position - b.position;

export function resolveLocation({
  rules,
  startTime,
  scheduleTimeZone,
}: {
  rules: LocationRule[];
  startTime: Date;
  scheduleTimeZone: string;
}): ResolvedLocation | null {
  const local = dayjs(startTime).tz(scheduleTimeZone);
  const localDate = local.format("YYYY-MM-DD");
  const localWeekday = local.day();
  const localMinutes = local.hour() * 60 + local.minute();

  // A @db.Date column also comes back as a UTC-midnight Date, so compare on the
  // UTC calendar date rather than converting it into the schedule's zone.
  const dated = rules.filter(
    (r) => r.date !== null && dayjs.utc(r.date).format("YYYY-MM-DD") === localDate
  );
  const recurring = rules.filter(
    (r) => r.date === null && (r.days.length === 0 || r.days.includes(localWeekday))
  );

  for (const group of [dated, recurring]) {
    const match = [...group].sort(byPosition).find((r) => matchesWindow(r, localMinutes));
    if (match) {
      return { scheduleLocationId: match.scheduleLocationId, locked: match.locked, ruleId: match.id };
    }
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TZ=UTC yarn vitest run packages/features/schedules/lib/resolveLocation.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/features/schedules/lib/resolveLocation.ts packages/features/schedules/lib/resolveLocation.test.ts
git commit -m "feat(schedules): resolve a booking instant to a single location rule"
```

---

### Task 3: `resolveLocation` — timezone correctness

**Files:**
- Test: `packages/features/schedules/lib/resolveLocation.timezone.test.ts`
- Modify (only if a test fails): `packages/features/schedules/lib/resolveLocation.ts`

**Interfaces:**
- Consumes: `resolveLocation`, `LocationRule` from Task 2.
- Produces: nothing new. This task proves the server's own `TZ` cannot change the answer.

- [ ] **Step 1: Write the failing-if-broken tests**

```ts
import { describe, expect, it } from "vitest";

import { resolveLocation, type LocationRule } from "./resolveLocation";

const NY = "America/New_York";

const fridayRule: LocationRule = {
  id: 1,
  position: 0,
  date: null,
  days: [5],
  startTime: null,
  endTime: null,
  locked: true,
  scheduleLocationId: 42,
};

describe("resolveLocation across timezones", () => {
  it("uses the schedule's weekday, not the server's", () => {
    // 2026-09-11 14:00Z = Friday 10:00 in New York.
    const instant = new Date("2026-09-11T14:00:00Z");
    expect(resolveLocation({ rules: [fridayRule], startTime: instant, scheduleTimeZone: NY })?.ruleId).toBe(1);
  });

  it("does not match when the schedule's local day is not Friday", () => {
    // 2026-09-12 02:00Z is Saturday in New York (Fri 22:00 is 2026-09-12T02:00Z).
    const instant = new Date("2026-09-12T05:00:00Z"); // Sat 01:00 New York
    expect(resolveLocation({ rules: [fridayRule], startTime: instant, scheduleTimeZone: NY })).toBeNull();
  });

  it("matches a Friday-evening slot that is already Saturday in UTC", () => {
    // Friday 21:00 New York = 2026-09-12T01:00Z, i.e. Saturday in UTC.
    const instant = new Date("2026-09-12T01:00:00Z");
    expect(resolveLocation({ rules: [fridayRule], startTime: instant, scheduleTimeZone: NY })?.ruleId).toBe(1);
  });

  it("applies a morning window in the schedule's zone across a DST boundary", () => {
    const morningRule: LocationRule = {
      ...fridayRule,
      days: [4],
      startTime: new Date("1970-01-01T09:30:00Z"),
      endTime: new Date("1970-01-01T12:00:00Z"),
    };
    // 2026-11-05 is a Thursday, after US DST ends: 15:00Z = 10:00 New York.
    const afterDst = new Date("2026-11-05T15:00:00Z");
    expect(resolveLocation({ rules: [morningRule], startTime: afterDst, scheduleTimeZone: NY })?.ruleId).toBe(1);
    // Before DST ends: 2026-10-08 14:00Z = 10:00 New York.
    const beforeDst = new Date("2026-10-08T14:00:00Z");
    expect(resolveLocation({ rules: [morningRule], startTime: beforeDst, scheduleTimeZone: NY })?.ruleId).toBe(1);
  });
});
```

- [ ] **Step 2: Run under UTC**

Run: `TZ=UTC yarn vitest run packages/features/schedules/lib/resolveLocation.timezone.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 3: Run under a zone ahead of the schedule**

Run: `TZ=Australia/Sydney yarn vitest run packages/features/schedules/lib/resolveLocation.timezone.test.ts`
Expected: PASS, 4 tests. A failure here means the implementation is reading the server's local weekday somewhere.

- [ ] **Step 4: Run under a zone behind the schedule**

Run: `TZ=America/Los_Angeles yarn vitest run packages/features/schedules/lib/resolveLocation.timezone.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/features/schedules/lib/resolveLocation.timezone.test.ts
git commit -m "test(schedules): prove location resolution ignores the server timezone"
```

---

### Task 4: Match a schedule location to an event-type location

**Files:**
- Create: `packages/features/schedules/lib/matchScheduleLocation.ts`
- Test: `packages/features/schedules/lib/matchScheduleLocation.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks at runtime.
- Produces:
  ```ts
  export type ScheduleLocationLike = {
    id: number; type: string; address: string | null; credentialId: number | null;
  };
  export type EventTypeLocationLike = {
    type: string; address?: string; credentialId?: number;
  };
  export function matchScheduleLocation(
    scheduleLocation: ScheduleLocationLike,
    eventTypeLocations: EventTypeLocationLike[]
  ): EventTypeLocationLike | null;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { matchScheduleLocation, type ScheduleLocationLike } from "./matchScheduleLocation";

const tampa: ScheduleLocationLike = {
  id: 1,
  type: "inPerson",
  address: "100 Ashley Dr, Tampa",
  credentialId: null,
};
const zoom: ScheduleLocationLike = {
  id: 2,
  type: "integrations:zoom",
  address: null,
  credentialId: 3,
};

describe("matchScheduleLocation", () => {
  it("returns null when the event type has no location of that type", () => {
    expect(matchScheduleLocation(zoom, [{ type: "inPerson", address: "x" }])).toBeNull();
  });

  it("matches an integration on type and credentialId", () => {
    const match = matchScheduleLocation(zoom, [{ type: "integrations:zoom", credentialId: 3 }]);
    expect(match).toEqual({ type: "integrations:zoom", credentialId: 3 });
  });

  it("does not match an integration whose credentialId differs", () => {
    expect(matchScheduleLocation(zoom, [{ type: "integrations:zoom", credentialId: 99 }])).toBeNull();
  });

  it("matches an integration when the event type omits credentialId", () => {
    const match = matchScheduleLocation(zoom, [{ type: "integrations:zoom" }]);
    expect(match).toEqual({ type: "integrations:zoom" });
  });

  it("distinguishes two inPerson entries by address", () => {
    const match = matchScheduleLocation(tampa, [
      { type: "inPerson", address: "1 Biscayne Blvd, Miami" },
      { type: "inPerson", address: "100 Ashley Dr, Tampa" },
    ]);
    expect(match).toEqual({ type: "inPerson", address: "100 Ashley Dr, Tampa" });
  });

  it("ignores surrounding whitespace and case when comparing addresses", () => {
    const match = matchScheduleLocation(tampa, [{ type: "inPerson", address: "  100 ASHLEY DR, TAMPA " }]);
    expect(match).not.toBeNull();
  });

  it("returns null when no inPerson address matches", () => {
    expect(matchScheduleLocation(tampa, [{ type: "inPerson", address: "elsewhere" }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TZ=UTC yarn vitest run packages/features/schedules/lib/matchScheduleLocation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
export type ScheduleLocationLike = {
  id: number;
  type: string;
  address: string | null;
  credentialId: number | null;
};

export type EventTypeLocationLike = {
  type: string;
  address?: string;
  credentialId?: number;
};

const normalise = (value: string | null | undefined): string => (value ?? "").trim().toLowerCase();

/**
 * A schedule location only takes effect if the event type already offers it, so
 * booking creation keeps validating against `eventType.locations` unchanged. No
 * match makes the rule inert rather than an error: a booking page that still
 * works beats one that is correct-or-broken.
 */
export function matchScheduleLocation(
  scheduleLocation: ScheduleLocationLike,
  eventTypeLocations: EventTypeLocationLike[]
): EventTypeLocationLike | null {
  const candidates = eventTypeLocations.filter((location) => location.type === scheduleLocation.type);
  if (candidates.length === 0) return null;

  if (scheduleLocation.credentialId !== null) {
    // An event type that omits credentialId predates multi-account support and
    // resolves to the user's only credential for that app, so treat it as a match.
    return (
      candidates.find(
        (c) => c.credentialId === undefined || c.credentialId === scheduleLocation.credentialId
      ) ?? null
    );
  }

  if (scheduleLocation.address !== null) {
    return candidates.find((c) => normalise(c.address) === normalise(scheduleLocation.address)) ?? null;
  }

  return candidates[0] ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TZ=UTC yarn vitest run packages/features/schedules/lib/matchScheduleLocation.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/features/schedules/lib/matchScheduleLocation.ts packages/features/schedules/lib/matchScheduleLocation.test.ts
git commit -m "feat(schedules): match a schedule location to an event type location"
```

---

### Task 5: Repository

**Files:**
- Create: `packages/features/schedules/repositories/ScheduleLocationRepository.ts`
- Test: `packages/features/schedules/repositories/ScheduleLocationRepository.test.ts`

**Interfaces:**
- Consumes: Prisma models from Task 1; `LocationRule` from Task 2.
- Produces:
  ```ts
  export type ScheduleLocationRow = ScheduleLocationLike & { label: string; shortCode: string };

  export class ScheduleLocationRepository {
    static findLocationsByScheduleId(args: { scheduleId: number }): Promise<ScheduleLocationRow[]>;
    static findRulesByScheduleId(args: { scheduleId: number }): Promise<LocationRule[]>;
  }
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ScheduleLocationRepository } from "./ScheduleLocationRepository";

vi.mock("@calcom/prisma", () => {
  const mockPrisma = {
    scheduleLocation: { findMany: vi.fn() },
    scheduleLocationRule: { findMany: vi.fn() },
  };
  return { __esModule: true, default: mockPrisma, prisma: mockPrisma };
});

const { prisma } = await import("@calcom/prisma");

describe("ScheduleLocationRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.scheduleLocation.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.scheduleLocationRule.findMany).mockResolvedValue([] as never);
  });

  it("scopes locations to the schedule and selects explicit fields", async () => {
    await ScheduleLocationRepository.findLocationsByScheduleId({ scheduleId: 1 });
    const arg = vi.mocked(prisma.scheduleLocation.findMany).mock.calls[0][0];
    expect(arg.where).toEqual({ scheduleId: 1 });
    expect(arg.select).toBeDefined();
    expect(arg).not.toHaveProperty("include");
  });

  it("returns rules ordered by position so first-match-wins is deterministic", async () => {
    await ScheduleLocationRepository.findRulesByScheduleId({ scheduleId: 1 });
    const arg = vi.mocked(prisma.scheduleLocationRule.findMany).mock.calls[0][0];
    expect(arg.where).toEqual({ scheduleId: 1 });
    expect(arg.orderBy).toEqual({ position: "asc" });
    expect(arg).not.toHaveProperty("include");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TZ=UTC yarn vitest run packages/features/schedules/repositories/ScheduleLocationRepository.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
import { prisma } from "@calcom/prisma";

import type { LocationRule } from "../lib/resolveLocation";
import type { ScheduleLocationLike } from "../lib/matchScheduleLocation";

export type ScheduleLocationRow = ScheduleLocationLike & { label: string; shortCode: string };

export class ScheduleLocationRepository {
  static async findLocationsByScheduleId({
    scheduleId,
  }: {
    scheduleId: number;
  }): Promise<ScheduleLocationRow[]> {
    return prisma.scheduleLocation.findMany({
      where: { scheduleId },
      select: {
        id: true,
        label: true,
        shortCode: true,
        type: true,
        address: true,
        credentialId: true,
      },
    });
  }

  static async findRulesByScheduleId({ scheduleId }: { scheduleId: number }): Promise<LocationRule[]> {
    return prisma.scheduleLocationRule.findMany({
      where: { scheduleId },
      orderBy: { position: "asc" },
      select: {
        id: true,
        position: true,
        date: true,
        days: true,
        startTime: true,
        endTime: true,
        locked: true,
        scheduleLocationId: true,
      },
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TZ=UTC yarn vitest run packages/features/schedules/repositories/ScheduleLocationRepository.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Type-check the whole web app**

Run: `./node_modules/.bin/tsc --pretty false --noEmit -p apps/web/tsconfig.json`
Expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
git add packages/features/schedules/repositories/ScheduleLocationRepository.ts packages/features/schedules/repositories/ScheduleLocationRepository.test.ts
git commit -m "feat(schedules): add ScheduleLocationRepository"
```

---

## Phase 1 exit criteria

- `TZ=UTC yarn vitest run packages/features/schedules/` is green.
- The timezone suite passes under `UTC`, `Australia/Sydney`, and `America/Los_Angeles`.
- `tsc -p apps/web/tsconfig.json` exits 0.
- `SELECT count(*) FROM "Booking"` is unchanged from before the migration.
- The running site still returns HTTP 200; no rebuild or restart is performed in this phase.

## Follow-on plans

- **Phase 2** — schedule location editor: manage `ScheduleLocation` rows, month-calendar date assignment, event-type opt-in toggle, missing-location warning.
- **Phase 3** — booker resolution and server-side enforcement.
- **Phase 4** — day-cell codes, per-slot codes, band, legend.
