import type { TrpcSessionUser } from "../../../../types";
import type { TAssignDateInputSchema } from "./assignDate.schema";
import { getScheduleLocationService } from "./getScheduleLocationService";

type AssignDateOptions = {
  ctx: { user: Pick<NonNullable<TrpcSessionUser>, "id"> };
  input: TAssignDateInputSchema;
};

export const assignDateHandler = async ({ ctx, input }: AssignDateOptions) => {
  await getScheduleLocationService().assignDate({
    scheduleId: input.scheduleId,
    userId: ctx.user.id,
    // Pinned to UTC midnight because Prisma stores @db.Date that way; building it from the
    // server's local zone would shift the day for anywhere west of Greenwich.
    date: new Date(`${input.date}T00:00:00.000Z`),
    scheduleLocationId: input.scheduleLocationId,
  });
  return { success: true };
};
