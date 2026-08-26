import type { TrpcSessionUser } from "../../../../types";
import { getScheduleLocationService } from "./getScheduleLocationService";
import type { TListInputSchema } from "./list.schema";

type ListOptions = {
  ctx: { user: Pick<NonNullable<TrpcSessionUser>, "id"> };
  input: TListInputSchema;
};

export const listHandler = async ({ ctx, input }: ListOptions) => {
  return getScheduleLocationService().listForSchedule({
    scheduleId: input.scheduleId,
    userId: ctx.user.id,
  });
};
