# Schedule Location Rules — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the schedule owner record their locations and say which dates they are at each one, so Phase 3 has real data to resolve against.

**Architecture:** A service owns every write. It is the only place that knows a schedule belongs to a user, that short codes are unique per schedule, and that a dated rule replaces rather than stacks. The repository stays pure data access and scopes each write by `scheduleId` so a caller cannot reach another schedule's rows even by mistake. tRPC handlers are thin and delegate straight to the service.

**Tech Stack:** TypeScript (strict), Prisma 6.16 / PostgreSQL, tRPC, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-schedule-location-rules-design.md`

## Global Constraints

- Use `select`, never `include`, in Prisma queries.
- `import type { X }` for type-only imports; no barrel imports.
- No `as any`.
- Repositories: data access only. Validation and ownership live in the service.
- `packages/features/**` must not import from `@calcom/trpc`. The service raises `ErrorWithCode`; the tRPC middleware converts it.
- Weekday numbering `0=Sunday … 6=Saturday`.
- Conventional commits.
- `TZ=UTC yarn vitest run <path>` for tests.
- Nothing here may change behaviour for an event type that has not opted in.

## Splitting

Phase 2 is ~14 files, past the 500-line / 10-file guidance, so it ships in three parts:

- **2a — service + repository writes** (this plan, Tasks 1-2). No API surface.
- **2b — tRPC endpoints** (Task 3). Thin handlers over the service.
- **2c — editor UI** (separate plan). Month calendar on the schedule page, plus the event-type opt-in toggle.

Nothing is user-visible until 2c.

## Model of the two rule kinds

The calendar editor and the recurring baseline are different operations and are kept apart deliberately:

| | Dated rule | Recurring rule |
| --- | --- | --- |
| Created by | clicking a day in the month calendar | editing the weekday baseline |
| `date` | set | null |
| `days` | empty | the weekdays it covers |
| Time bounds | always all-day | optional, e.g. Thursday 09:30-12:00 |
| Cardinality | at most one per date | many, ordered by `position` |

One dated rule per date keeps the calendar click unambiguous — a second click on the same day replaces rather than stacks. Full expressiveness (time windows, ordering, `locked`) lives on the recurring rules, which is where Thursday-morning belongs.

---

### Task 1: Repository writes

**Files:**
- Modify: `packages/features/schedules/repositories/ScheduleLocationRepository.ts`
- Test: `packages/features/schedules/repositories/ScheduleLocationRepository.test.ts`

**Interfaces:**
- Consumes: `LocationRule` and `ScheduleLocationRow` from Phase 1.
- Produces:
  ```ts
  static createLocation(args: {
    scheduleId: number; label: string; shortCode: string;
    type: string; address: string | null; credentialId: number | null;
  }): Promise<ScheduleLocationRow>;

  static updateLocation(args: {
    id: number; scheduleId: number;
    data: { label?: string; shortCode?: string; type?: string; address?: string | null; credentialId?: number | null };
  }): Promise<void>;

  static deleteLocation(args: { id: number; scheduleId: number }): Promise<void>;
  static findLocationByShortCode(args: { scheduleId: number; shortCode: string }): Promise<{ id: number } | null>;
  static upsertDateRule(args: { scheduleId: number; scheduleLocationId: number; date: Date }): Promise<void>;
  static deleteDateRule(args: { scheduleId: number; date: Date }): Promise<void>;
  static replaceRecurringRules(args: {
    scheduleId: number;
    rules: { scheduleLocationId: number; days: number[]; startTime: Date | null; endTime: Date | null; locked: boolean }[];
  }): Promise<void>;
  ```

- [ ] **Step 1: Write the failing tests**

Append to the existing describe block in `ScheduleLocationRepository.test.ts`, and extend the prisma mock to cover the new delegates:

```ts
vi.mock("@calcom/prisma", () => {
  const mockPrisma = {
    scheduleLocation: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    scheduleLocationRule: { findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
  };
  return { __esModule: true, default: mockPrisma, prisma: mockPrisma };
});
```

```ts
describe("writes", () => {
  it("scopes updateLocation by scheduleId so an id alone cannot reach another schedule", async () => {
    await ScheduleLocationRepository.updateLocation({ id: 5, scheduleId: 1, data: { label: "x" } });
    const arg = vi.mocked(prisma.scheduleLocation.updateMany).mock.calls[0][0];
    expect(arg.where).toEqual({ id: 5, scheduleId: 1 });
  });

  it("scopes deleteLocation by scheduleId", async () => {
    await ScheduleLocationRepository.deleteLocation({ id: 5, scheduleId: 1 });
    const arg = vi.mocked(prisma.scheduleLocation.deleteMany).mock.calls[0][0];
    expect(arg.where).toEqual({ id: 5, scheduleId: 1 });
  });

  it("replaces rather than stacks a dated rule", async () => {
    const date = new Date("2026-09-08T00:00:00Z");
    await ScheduleLocationRepository.upsertDateRule({ scheduleId: 1, scheduleLocationId: 2, date });
    expect(vi.mocked(prisma.scheduleLocationRule.deleteMany).mock.calls[0][0].where).toEqual({
      scheduleId: 1,
      date,
    });
    expect(vi.mocked(prisma.scheduleLocationRule.create).mock.calls[0][0].data).toMatchObject({
      scheduleId: 1,
      scheduleLocationId: 2,
      date,
      days: [],
      position: 0,
      locked: false,
    });
  });

  it("deletes only dated rules for that date", async () => {
    const date = new Date("2026-09-08T00:00:00Z");
    await ScheduleLocationRepository.deleteDateRule({ scheduleId: 1, date });
    expect(vi.mocked(prisma.scheduleLocationRule.deleteMany).mock.calls[0][0].where).toEqual({
      scheduleId: 1,
      date,
    });
  });

  it("replaceRecurringRules clears only recurring rows, leaving dated ones alone", async () => {
    await ScheduleLocationRepository.replaceRecurringRules({
      scheduleId: 1,
      rules: [{ scheduleLocationId: 2, days: [2, 3], startTime: null, endTime: null, locked: false }],
    });
    expect(vi.mocked(prisma.scheduleLocationRule.deleteMany).mock.calls[0][0].where).toEqual({
      scheduleId: 1,
      date: null,
    });
  });

  it("assigns ascending positions to recurring rules in the order given", async () => {
    await ScheduleLocationRepository.replaceRecurringRules({
      scheduleId: 1,
      rules: [
        { scheduleLocationId: 2, days: [2], startTime: null, endTime: null, locked: false },
        { scheduleLocationId: 3, days: [5], startTime: null, endTime: null, locked: true },
      ],
    });
    const rows = vi.mocked(prisma.scheduleLocationRule.createMany).mock.calls[0][0].data;
    expect(rows.map((r: { position: number }) => r.position)).toEqual([0, 1]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TZ=UTC yarn vitest run packages/features/schedules/repositories/ScheduleLocationRepository.test.ts`
Expected: FAIL — `updateLocation is not a function`.

- [ ] **Step 3: Add the write methods**

```ts
  static async createLocation({
    scheduleId,
    label,
    shortCode,
    type,
    address,
    credentialId,
  }: {
    scheduleId: number;
    label: string;
    shortCode: string;
    type: string;
    address: string | null;
    credentialId: number | null;
  }): Promise<ScheduleLocationRow> {
    return prisma.scheduleLocation.create({
      data: { scheduleId, label, shortCode, type, address, credentialId },
      select: { id: true, label: true, shortCode: true, type: true, address: true, credentialId: true },
    });
  }

  /**
   * scheduleId is part of the where clause rather than a preceding ownership check, so a
   * caller holding only a location id cannot reach a location on someone else's schedule.
   */
  static async updateLocation({
    id,
    scheduleId,
    data,
  }: {
    id: number;
    scheduleId: number;
    data: {
      label?: string;
      shortCode?: string;
      type?: string;
      address?: string | null;
      credentialId?: number | null;
    };
  }): Promise<void> {
    await prisma.scheduleLocation.updateMany({ where: { id, scheduleId }, data });
  }

  static async deleteLocation({ id, scheduleId }: { id: number; scheduleId: number }): Promise<void> {
    await prisma.scheduleLocation.deleteMany({ where: { id, scheduleId } });
  }

  static async findLocationByShortCode({
    scheduleId,
    shortCode,
  }: {
    scheduleId: number;
    shortCode: string;
  }): Promise<{ id: number } | null> {
    return prisma.scheduleLocation.findFirst({ where: { scheduleId, shortCode }, select: { id: true } });
  }

  /**
   * One dated rule per date: a second click on the same day replaces the first rather than
   * stacking a second rule whose precedence would depend on insertion order.
   */
  static async upsertDateRule({
    scheduleId,
    scheduleLocationId,
    date,
  }: {
    scheduleId: number;
    scheduleLocationId: number;
    date: Date;
  }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.scheduleLocationRule.deleteMany({ where: { scheduleId, date } });
      await tx.scheduleLocationRule.create({
        data: {
          scheduleId,
          scheduleLocationId,
          date,
          days: [],
          startTime: null,
          endTime: null,
          locked: false,
          position: 0,
        },
      });
    });
  }

  static async deleteDateRule({ scheduleId, date }: { scheduleId: number; date: Date }): Promise<void> {
    await prisma.scheduleLocationRule.deleteMany({ where: { scheduleId, date } });
  }

  /**
   * `date: null` in the delete filter is what keeps the calendar's one-off assignments
   * alive while the weekday baseline is rewritten.
   */
  static async replaceRecurringRules({
    scheduleId,
    rules,
  }: {
    scheduleId: number;
    rules: {
      scheduleLocationId: number;
      days: number[];
      startTime: Date | null;
      endTime: Date | null;
      locked: boolean;
    }[];
  }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.scheduleLocationRule.deleteMany({ where: { scheduleId, date: null } });
      if (rules.length === 0) return;
      await tx.scheduleLocationRule.createMany({
        data: rules.map((rule, index) => ({
          scheduleId,
          scheduleLocationId: rule.scheduleLocationId,
          date: null,
          days: rule.days,
          startTime: rule.startTime,
          endTime: rule.endTime,
          locked: rule.locked,
          position: index,
        })),
      });
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TZ=UTC yarn vitest run packages/features/schedules/repositories/ScheduleLocationRepository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/features/schedules/repositories/
git commit -m "feat(schedules): add schedule location write methods"
```

---

### Task 2: Service

**Files:**
- Create: `packages/features/schedules/services/ScheduleLocationService.ts`
- Test: `packages/features/schedules/services/ScheduleLocationService.test.ts`

**Interfaces:**
- Consumes: `ScheduleLocationRepository` from Task 1.
- Produces:
  ```ts
  export interface IScheduleLocationServiceDeps {
    scheduleLocationRepo: typeof ScheduleLocationRepository;
    findScheduleOwner: (scheduleId: number) => Promise<number | null>;
  }
  export class ScheduleLocationService {
    constructor(deps: IScheduleLocationServiceDeps);
    listForSchedule(args: { scheduleId: number; userId: number }): Promise<{ locations: ScheduleLocationRow[]; rules: LocationRule[] }>;
    createLocation(args: { scheduleId: number; userId: number; label: string; shortCode: string; type: string; address?: string | null; credentialId?: number | null }): Promise<ScheduleLocationRow>;
    deleteLocation(args: { scheduleId: number; userId: number; locationId: number }): Promise<void>;
    assignDate(args: { scheduleId: number; userId: number; date: Date; scheduleLocationId: number | null }): Promise<void>;
    setRecurringRules(args: { scheduleId: number; userId: number; rules: { scheduleLocationId: number; days: number[]; startTime: Date | null; endTime: Date | null; locked: boolean }[] }): Promise<void>;
  }
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorCode } from "@calcom/lib/errorCodes";

import { ScheduleLocationService } from "./ScheduleLocationService";

const repo = {
  findLocationsByScheduleId: vi.fn(),
  findRulesByScheduleId: vi.fn(),
  createLocation: vi.fn(),
  deleteLocation: vi.fn(),
  findLocationByShortCode: vi.fn(),
  upsertDateRule: vi.fn(),
  deleteDateRule: vi.fn(),
  replaceRecurringRules: vi.fn(),
};

const OWNER = 42;
const build = (ownerId: number | null = OWNER) =>
  new ScheduleLocationService({
    // biome-ignore lint/suspicious/noExplicitAny: test double for a static-method repository
    scheduleLocationRepo: repo as any,
    findScheduleOwner: vi.fn(async () => ownerId),
  });

describe("ScheduleLocationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findLocationsByScheduleId.mockResolvedValue([]);
    repo.findRulesByScheduleId.mockResolvedValue([]);
    repo.findLocationByShortCode.mockResolvedValue(null);
  });

  it("refuses to read a schedule the user does not own", async () => {
    await expect(build(99).listForSchedule({ scheduleId: 1, userId: OWNER })).rejects.toMatchObject({
      code: ErrorCode.Forbidden,
    });
  });

  it("refuses to write to a schedule the user does not own", async () => {
    await expect(
      build(99).assignDate({ scheduleId: 1, userId: OWNER, date: new Date(), scheduleLocationId: 2 })
    ).rejects.toMatchObject({ code: ErrorCode.Forbidden });
    expect(repo.upsertDateRule).not.toHaveBeenCalled();
  });

  it("refuses a schedule that does not exist", async () => {
    await expect(build(null).listForSchedule({ scheduleId: 1, userId: OWNER })).rejects.toMatchObject({
      code: ErrorCode.NotFound,
    });
  });

  it("rejects a duplicate short code within the schedule", async () => {
    repo.findLocationByShortCode.mockResolvedValue({ id: 7 });
    await expect(
      build().createLocation({ scheduleId: 1, userId: OWNER, label: "Tampa", shortCode: "TPA", type: "inPerson" })
    ).rejects.toMatchObject({ code: ErrorCode.BadRequest });
    expect(repo.createLocation).not.toHaveBeenCalled();
  });

  it("normalises the short code to upper case", async () => {
    await build().createLocation({
      scheduleId: 1,
      userId: OWNER,
      label: "Tampa",
      shortCode: " tpa ",
      type: "inPerson",
    });
    expect(repo.createLocation).toHaveBeenCalledWith(expect.objectContaining({ shortCode: "TPA" }));
  });

  it("rejects an empty label", async () => {
    await expect(
      build().createLocation({ scheduleId: 1, userId: OWNER, label: "  ", shortCode: "TPA", type: "inPerson" })
    ).rejects.toMatchObject({ code: ErrorCode.BadRequest });
  });

  it("clears a date when given a null location", async () => {
    const date = new Date("2026-09-08T00:00:00Z");
    await build().assignDate({ scheduleId: 1, userId: OWNER, date, scheduleLocationId: null });
    expect(repo.deleteDateRule).toHaveBeenCalledWith({ scheduleId: 1, date });
    expect(repo.upsertDateRule).not.toHaveBeenCalled();
  });

  it("rejects a weekday outside 0-6", async () => {
    await expect(
      build().setRecurringRules({
        scheduleId: 1,
        userId: OWNER,
        rules: [{ scheduleLocationId: 2, days: [7], startTime: null, endTime: null, locked: false }],
      })
    ).rejects.toMatchObject({ code: ErrorCode.BadRequest });
  });

  it("rejects a time window that ends before it starts", async () => {
    await expect(
      build().setRecurringRules({
        scheduleId: 1,
        userId: OWNER,
        rules: [
          {
            scheduleLocationId: 2,
            days: [4],
            startTime: new Date("1970-01-01T12:00:00Z"),
            endTime: new Date("1970-01-01T09:00:00Z"),
            locked: false,
          },
        ],
      })
    ).rejects.toMatchObject({ code: ErrorCode.BadRequest });
  });

  it("passes valid recurring rules through in order", async () => {
    const rules = [
      { scheduleLocationId: 2, days: [2, 3], startTime: null, endTime: null, locked: false },
      { scheduleLocationId: 3, days: [5], startTime: null, endTime: null, locked: true },
    ];
    await build().setRecurringRules({ scheduleId: 1, userId: OWNER, rules });
    expect(repo.replaceRecurringRules).toHaveBeenCalledWith({ scheduleId: 1, rules });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `TZ=UTC yarn vitest run packages/features/schedules/services/ScheduleLocationService.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the service**

```ts
import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";

import type { ScheduleLocationRow } from "../repositories/ScheduleLocationRepository";
import type { ScheduleLocationRepository } from "../repositories/ScheduleLocationRepository";
import type { LocationRule } from "../lib/resolveLocation";

const SHORT_CODE_MAX = 4;
const MINUTES_PER_DAY = 24 * 60;

export type RecurringRuleInput = {
  scheduleLocationId: number;
  days: number[];
  startTime: Date | null;
  endTime: Date | null;
  locked: boolean;
};

export interface IScheduleLocationServiceDeps {
  scheduleLocationRepo: typeof ScheduleLocationRepository;
  findScheduleOwner: (scheduleId: number) => Promise<number | null>;
}

const minutesFromTimeColumn = (value: Date): number => value.getUTCHours() * 60 + value.getUTCMinutes();

export class ScheduleLocationService {
  constructor(private deps: IScheduleLocationServiceDeps) {}

  /**
   * Every public method funnels through here. Ownership is not something the tRPC layer can
   * be trusted to have checked, and a schedule id is guessable.
   */
  private async assertOwnership(scheduleId: number, userId: number): Promise<void> {
    const ownerId = await this.deps.findScheduleOwner(scheduleId);
    if (ownerId === null) throw new ErrorWithCode(ErrorCode.NotFound, "Schedule not found");
    if (ownerId !== userId) throw ErrorWithCode.Factory.Forbidden("This schedule belongs to someone else");
  }

  async listForSchedule({ scheduleId, userId }: { scheduleId: number; userId: number }): Promise<{
    locations: ScheduleLocationRow[];
    rules: LocationRule[];
  }> {
    await this.assertOwnership(scheduleId, userId);
    const [locations, rules] = await Promise.all([
      this.deps.scheduleLocationRepo.findLocationsByScheduleId({ scheduleId }),
      this.deps.scheduleLocationRepo.findRulesByScheduleId({ scheduleId }),
    ]);
    return { locations, rules };
  }

  async createLocation({
    scheduleId,
    userId,
    label,
    shortCode,
    type,
    address = null,
    credentialId = null,
  }: {
    scheduleId: number;
    userId: number;
    label: string;
    shortCode: string;
    type: string;
    address?: string | null;
    credentialId?: number | null;
  }): Promise<ScheduleLocationRow> {
    await this.assertOwnership(scheduleId, userId);

    const trimmedLabel = label.trim();
    if (!trimmedLabel) throw ErrorWithCode.Factory.BadRequest("A location needs a label");

    // Upper-cased so the calendar marker is stable regardless of how it was typed, and so
    // uniqueness is not defeated by casing alone.
    const normalisedCode = shortCode.trim().toUpperCase();
    if (!normalisedCode || normalisedCode.length > SHORT_CODE_MAX) {
      throw ErrorWithCode.Factory.BadRequest(`A short code must be 1-${SHORT_CODE_MAX} characters`);
    }

    const clash = await this.deps.scheduleLocationRepo.findLocationByShortCode({
      scheduleId,
      shortCode: normalisedCode,
    });
    if (clash) {
      throw ErrorWithCode.Factory.BadRequest(`Short code ${normalisedCode} is already used on this schedule`);
    }

    return this.deps.scheduleLocationRepo.createLocation({
      scheduleId,
      label: trimmedLabel,
      shortCode: normalisedCode,
      type,
      address,
      credentialId,
    });
  }

  async deleteLocation({
    scheduleId,
    userId,
    locationId,
  }: {
    scheduleId: number;
    userId: number;
    locationId: number;
  }): Promise<void> {
    await this.assertOwnership(scheduleId, userId);
    // Rules referencing it go with it via onDelete: Cascade, which is what we want here:
    // a rule pointing at a location that no longer exists has nothing to resolve to.
    await this.deps.scheduleLocationRepo.deleteLocation({ id: locationId, scheduleId });
  }

  async assignDate({
    scheduleId,
    userId,
    date,
    scheduleLocationId,
  }: {
    scheduleId: number;
    userId: number;
    date: Date;
    scheduleLocationId: number | null;
  }): Promise<void> {
    await this.assertOwnership(scheduleId, userId);
    if (scheduleLocationId === null) {
      await this.deps.scheduleLocationRepo.deleteDateRule({ scheduleId, date });
      return;
    }
    await this.deps.scheduleLocationRepo.upsertDateRule({ scheduleId, scheduleLocationId, date });
  }

  async setRecurringRules({
    scheduleId,
    userId,
    rules,
  }: {
    scheduleId: number;
    userId: number;
    rules: RecurringRuleInput[];
  }): Promise<void> {
    await this.assertOwnership(scheduleId, userId);

    for (const rule of rules) {
      if (rule.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
        throw ErrorWithCode.Factory.BadRequest("Weekdays must be integers between 0 and 6");
      }
      const from = rule.startTime ? minutesFromTimeColumn(rule.startTime) : 0;
      const to = rule.endTime ? minutesFromTimeColumn(rule.endTime) : MINUTES_PER_DAY;
      if (to <= from) {
        throw ErrorWithCode.Factory.BadRequest("A location window must end after it starts");
      }
    }

    await this.deps.scheduleLocationRepo.replaceRecurringRules({ scheduleId, rules });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `TZ=UTC yarn vitest run packages/features/schedules/services/ScheduleLocationService.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `./node_modules/.bin/tsc --pretty false --noEmit -p apps/web/tsconfig.json`
Expected: exit 0. **Do not run `yarn prisma generate` while this is running** — regenerating the client mid-check produces phantom errors.

- [ ] **Step 6: Commit**

```bash
git add packages/features/schedules/services/
git commit -m "feat(schedules): add ScheduleLocationService"
```

---

### Task 3: tRPC endpoints (part 2b)

**Files:**
- Create: `packages/trpc/server/routers/viewer/availability/scheduleLocations/_router.tsx`
- Create: `.../scheduleLocations/{list,createLocation,deleteLocation,assignDate,setRecurringRules}.{schema,handler}.ts`
- Modify: `packages/trpc/server/routers/viewer/availability/_router.tsx`

**Interfaces:**
- Consumes: `ScheduleLocationService` from Task 2.
- Produces: `viewer.availability.scheduleLocations.{list,createLocation,deleteLocation,assignDate,setRecurringRules}`.

- [ ] **Step 1: Write the schemas**

Each schema is a Zod object mirroring the service arguments minus `userId`, which comes from the session and must never be accepted from the client:

```ts
// list.schema.ts
import { z } from "zod";
export const ZListInputSchema = z.object({ scheduleId: z.number().int().positive() });
export type TListInputSchema = z.infer<typeof ZListInputSchema>;
```

```ts
// createLocation.schema.ts
import { z } from "zod";
export const ZCreateLocationInputSchema = z.object({
  scheduleId: z.number().int().positive(),
  label: z.string().min(1).max(200),
  shortCode: z.string().min(1).max(4),
  type: z.string().min(1).max(100),
  address: z.string().max(500).nullish(),
  credentialId: z.number().int().positive().nullish(),
});
export type TCreateLocationInputSchema = z.infer<typeof ZCreateLocationInputSchema>;
```

```ts
// deleteLocation.schema.ts
import { z } from "zod";
export const ZDeleteLocationInputSchema = z.object({
  scheduleId: z.number().int().positive(),
  locationId: z.number().int().positive(),
});
export type TDeleteLocationInputSchema = z.infer<typeof ZDeleteLocationInputSchema>;
```

```ts
// assignDate.schema.ts
import { z } from "zod";
export const ZAssignDateInputSchema = z.object({
  scheduleId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduleLocationId: z.number().int().positive().nullable(),
});
export type TAssignDateInputSchema = z.infer<typeof ZAssignDateInputSchema>;
```

The date is a plain `YYYY-MM-DD` string rather than a `Date`, because a serialized `Date` carries a time and a zone that would silently shift the calendar day.

```ts
// setRecurringRules.schema.ts
import { z } from "zod";
export const ZSetRecurringRulesInputSchema = z.object({
  scheduleId: z.number().int().positive(),
  rules: z
    .array(
      z.object({
        scheduleLocationId: z.number().int().positive(),
        days: z.array(z.number().int().min(0).max(6)),
        startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
        endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
        locked: z.boolean(),
      })
    )
    .max(50),
});
export type TSetRecurringRulesInputSchema = z.infer<typeof ZSetRecurringRulesInputSchema>;
```

- [ ] **Step 2: Write the handlers**

Each handler builds the service and delegates. `userId` comes from `ctx.user.id`, never from input. `HH:mm` and `YYYY-MM-DD` strings are converted to the UTC-pinned Dates that Prisma's `@db.Time` and `@db.Date` columns expect:

```ts
// assignDate.handler.ts
import { ScheduleLocationRepository } from "@calcom/features/schedules/repositories/ScheduleLocationRepository";
import { ScheduleLocationService } from "@calcom/features/schedules/services/ScheduleLocationService";
import prisma from "@calcom/prisma";

import type { TrpcSessionUser } from "../../../../types";
import type { TAssignDateInputSchema } from "./assignDate.schema";

type Options = { ctx: { user: NonNullable<TrpcSessionUser> }; input: TAssignDateInputSchema };

const buildService = () =>
  new ScheduleLocationService({
    scheduleLocationRepo: ScheduleLocationRepository,
    findScheduleOwner: async (scheduleId: number) => {
      const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId },
        select: { userId: true },
      });
      return schedule?.userId ?? null;
    },
  });

export const assignDateHandler = async ({ ctx, input }: Options) => {
  await buildService().assignDate({
    scheduleId: input.scheduleId,
    userId: ctx.user.id,
    date: new Date(`${input.date}T00:00:00.000Z`),
    scheduleLocationId: input.scheduleLocationId,
  });
  return { success: true };
};
```

Write the remaining four handlers to the same shape, calling `listForSchedule`, `createLocation`, `deleteLocation`, and `setRecurringRules` respectively. `setRecurringRules` converts each `HH:mm` to `new Date("1970-01-01T" + value + ":00.000Z")`.

- [ ] **Step 3: Write the sub-router**

```tsx
import authedProcedure from "../../../../procedures/authedProcedure";
import { router } from "../../../../trpc";
import { ZAssignDateInputSchema } from "./assignDate.schema";
import { ZCreateLocationInputSchema } from "./createLocation.schema";
import { ZDeleteLocationInputSchema } from "./deleteLocation.schema";
import { ZListInputSchema } from "./list.schema";
import { ZSetRecurringRulesInputSchema } from "./setRecurringRules.schema";

export const scheduleLocationsRouter = router({
  list: authedProcedure.input(ZListInputSchema).query(async ({ input, ctx }) => {
    const { listHandler } = await import("./list.handler");
    return listHandler({ ctx, input });
  }),
  createLocation: authedProcedure.input(ZCreateLocationInputSchema).mutation(async ({ input, ctx }) => {
    const { createLocationHandler } = await import("./createLocation.handler");
    return createLocationHandler({ ctx, input });
  }),
  deleteLocation: authedProcedure.input(ZDeleteLocationInputSchema).mutation(async ({ input, ctx }) => {
    const { deleteLocationHandler } = await import("./deleteLocation.handler");
    return deleteLocationHandler({ ctx, input });
  }),
  assignDate: authedProcedure.input(ZAssignDateInputSchema).mutation(async ({ input, ctx }) => {
    const { assignDateHandler } = await import("./assignDate.handler");
    return assignDateHandler({ ctx, input });
  }),
  setRecurringRules: authedProcedure
    .input(ZSetRecurringRulesInputSchema)
    .mutation(async ({ input, ctx }) => {
      const { setRecurringRulesHandler } = await import("./setRecurringRules.handler");
      return setRecurringRulesHandler({ ctx, input });
    }),
});
```

- [ ] **Step 4: Mount it**

In `packages/trpc/server/routers/viewer/availability/_router.tsx`, import `scheduleLocationsRouter` and add `scheduleLocations: scheduleLocationsRouter,` beside the existing `schedule: scheduleRouter,`.

- [ ] **Step 5: Type-check**

Run: `./node_modules/.bin/tsc --pretty false --noEmit -p apps/web/tsconfig.json`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/trpc/server/routers/viewer/availability/
git commit -m "feat(schedules): add tRPC endpoints for schedule locations"
```

---

## Phase 2a/2b exit criteria

- `TZ=UTC yarn vitest run packages/features/schedules/` is green.
- `tsc -p apps/web/tsconfig.json` exits 0.
- `SELECT count(*) FROM "Booking"` is unchanged.
- The running site still returns HTTP 200; no rebuild or restart.
- No endpoint accepts a `userId` from its input.

## Follow-on

- **2c** — editor UI: month calendar on the schedule page, location management, event-type opt-in toggle and missing-location warning.
