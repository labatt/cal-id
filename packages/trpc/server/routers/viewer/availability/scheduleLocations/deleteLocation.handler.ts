import type { TrpcSessionUser } from "../../../../types";
import type { TDeleteLocationInputSchema } from "./deleteLocation.schema";
import { getScheduleLocationService } from "./getScheduleLocationService";

type DeleteLocationOptions = {
  ctx: { user: Pick<NonNullable<TrpcSessionUser>, "id"> };
  input: TDeleteLocationInputSchema;
};

export const deleteLocationHandler = async ({ ctx, input }: DeleteLocationOptions) => {
  await getScheduleLocationService().deleteLocation({
    scheduleId: input.scheduleId,
    userId: ctx.user.id,
    locationId: input.locationId,
  });
  return { success: true };
};
