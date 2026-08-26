import type { TrpcSessionUser } from "../../../../types";
import { getScheduleLocationService } from "./getScheduleLocationService";
import type { TSetRecurringRulesInputSchema } from "./setRecurringRules.schema";

type SetRecurringRulesOptions = {
  ctx: { user: Pick<NonNullable<TrpcSessionUser>, "id"> };
  input: TSetRecurringRulesInputSchema;
};

/**
 * Prisma represents a @db.Time as a Date pinned to 1970-01-01 UTC, so an HH:mm is lifted
 * onto that epoch date rather than onto today — otherwise the stored value would drift with
 * the server's own date and offset.
 */
const toTimeColumn = (value: string | null): Date | null =>
  value === null ? null : new Date(`1970-01-01T${value}:00.000Z`);

export const setRecurringRulesHandler = async ({ ctx, input }: SetRecurringRulesOptions) => {
  await getScheduleLocationService().setRecurringRules({
    scheduleId: input.scheduleId,
    userId: ctx.user.id,
    rules: input.rules.map((rule) => ({
      scheduleLocationId: rule.scheduleLocationId,
      days: rule.days,
      startTime: toTimeColumn(rule.startTime),
      endTime: toTimeColumn(rule.endTime),
      locked: rule.locked,
    })),
  });
  return { success: true };
};
