import { ScheduleLocationRepository } from "@calcom/features/schedules/repositories/ScheduleLocationRepository";
import { ScheduleLocationService } from "@calcom/features/schedules/services/ScheduleLocationService";
import { prisma } from "@calcom/prisma";

/**
 * Shared by every handler in this router so they cannot drift into wiring the service
 * differently — in particular so none of them can accidentally skip the ownership lookup.
 */
export const getScheduleLocationService = (): ScheduleLocationService =>
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
