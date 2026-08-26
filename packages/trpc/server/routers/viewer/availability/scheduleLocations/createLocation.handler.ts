import type { TrpcSessionUser } from "../../../../types";
import type { TCreateLocationInputSchema } from "./createLocation.schema";
import { getScheduleLocationService } from "./getScheduleLocationService";

type CreateLocationOptions = {
  ctx: { user: Pick<NonNullable<TrpcSessionUser>, "id"> };
  input: TCreateLocationInputSchema;
};

export const createLocationHandler = async ({ ctx, input }: CreateLocationOptions) => {
  return getScheduleLocationService().createLocation({
    scheduleId: input.scheduleId,
    userId: ctx.user.id,
    label: input.label,
    shortCode: input.shortCode,
    type: input.type,
    address: input.address ?? null,
    credentialId: input.credentialId ?? null,
  });
};
