import type { TrpcSessionUser } from "../../../../types";
import { getScheduleLocationService } from "./getScheduleLocationService";
import type { TUpdateLocationInputSchema } from "./updateLocation.schema";

type UpdateLocationOptions = {
  ctx: { user: Pick<NonNullable<TrpcSessionUser>, "id"> };
  input: TUpdateLocationInputSchema;
};

export const updateLocationHandler = async ({ ctx, input }: UpdateLocationOptions) => {
  await getScheduleLocationService().updateLocation({
    scheduleId: input.scheduleId,
    userId: ctx.user.id,
    locationId: input.locationId,
    label: input.label,
    shortCode: input.shortCode,
    compactCode: input.compactCode ?? null,
    type: input.type,
    address: input.address ?? null,
  });
  return { success: true };
};
