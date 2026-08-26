import { prisma } from "@calcom/prisma";
import type { ScheduleLocationLike } from "../lib/matchScheduleLocation";
import type { LocationRule } from "../lib/resolveLocation";

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
