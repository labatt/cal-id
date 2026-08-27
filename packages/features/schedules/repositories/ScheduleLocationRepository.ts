import { prisma } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import type { ScheduleLocationLike } from "../lib/matchScheduleLocation";
import type { LocationRule } from "../lib/resolveLocation";

export type ScheduleLocationRow = ScheduleLocationLike & {
  label: string;
  shortCode: string;
  compactCode: string | null;
};

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
        compactCode: true,
        type: true,
        address: true,
        credentialId: true,
      },
    });
  }

  /**
   * The raw facts needed to resolve a booking's location, in one read.
   *
   * scheduleId is returned alongside the owner's defaultScheduleId rather than resolved here:
   * choosing between them is a rule, not data access, and it has to be applied identically by
   * the booker and the booking endpoint.
   */
  static async findEventTypeScheduleContext({ eventTypeId }: { eventTypeId: number }): Promise<{
    useScheduleLocations: boolean;
    locations: Prisma.JsonValue;
    scheduleId: number | null;
    ownerDefaultScheduleId: number | null;
    ownerTimeZone: string | null;
  } | null> {
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
      select: {
        useScheduleLocations: true,
        locations: true,
        scheduleId: true,
        owner: { select: { defaultScheduleId: true, timeZone: true } },
      },
    });
    if (!eventType) return null;
    return {
      useScheduleLocations: eventType.useScheduleLocations,
      locations: eventType.locations,
      scheduleId: eventType.scheduleId,
      ownerDefaultScheduleId: eventType.owner?.defaultScheduleId ?? null,
      ownerTimeZone: eventType.owner?.timeZone ?? null,
    };
  }

  static async findScheduleTimeZone({ scheduleId }: { scheduleId: number }): Promise<string | null> {
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      select: { timeZone: true },
    });
    return schedule?.timeZone ?? null;
  }

  static async createLocation({
    scheduleId,
    label,
    shortCode,
    compactCode,
    type,
    address,
    credentialId,
  }: {
    scheduleId: number;
    label: string;
    shortCode: string;
    compactCode: string | null;
    type: string;
    address: string | null;
    credentialId: number | null;
  }): Promise<ScheduleLocationRow> {
    return prisma.scheduleLocation.create({
      data: { scheduleId, label, shortCode, compactCode, type, address, credentialId },
      select: {
        id: true,
        label: true,
        shortCode: true,
        compactCode: true,
        type: true,
        address: true,
        credentialId: true,
      },
    });
  }

  /**
   * scheduleId sits in the where clause rather than behind a preceding ownership check, so a
   * caller holding only a location id cannot reach a location on somebody else's schedule.
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
   * One dated rule per date: clicking the same day again replaces the previous choice rather
   * than stacking a second rule whose precedence would come down to insertion order.
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
   * `date: null` in the delete filter is what keeps the calendar's one-off assignments alive
   * while the weekday baseline underneath them is rewritten.
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

  /**
   * Ordered by position because resolution is first-match-wins; an unordered read would
   * make the winning rule depend on whatever order Postgres happened to return.
   */
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
