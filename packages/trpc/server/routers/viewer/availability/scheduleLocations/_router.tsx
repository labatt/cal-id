import authedProcedure from "../../../../procedures/authedProcedure";
import { router } from "../../../../trpc";
import { ZAssignDateInputSchema } from "./assignDate.schema";
import { ZCreateLocationInputSchema } from "./createLocation.schema";
import { ZDeleteLocationInputSchema } from "./deleteLocation.schema";
import { ZListInputSchema } from "./list.schema";
import { ZSetRecurringRulesInputSchema } from "./setRecurringRules.schema";
import { ZUpdateLocationInputSchema } from "./updateLocation.schema";

export const scheduleLocationsRouter = router({
  list: authedProcedure.input(ZListInputSchema).query(async ({ input, ctx }) => {
    const { listHandler } = await import("./list.handler");

    return listHandler({ ctx, input });
  }),

  createLocation: authedProcedure.input(ZCreateLocationInputSchema).mutation(async ({ input, ctx }) => {
    const { createLocationHandler } = await import("./createLocation.handler");

    return createLocationHandler({ ctx, input });
  }),

  updateLocation: authedProcedure.input(ZUpdateLocationInputSchema).mutation(async ({ input, ctx }) => {
    const { updateLocationHandler } = await import("./updateLocation.handler");

    return updateLocationHandler({ ctx, input });
  }),

  deleteLocation: authedProcedure.input(ZDeleteLocationInputSchema).mutation(async ({ input, ctx }) => {
    const { deleteLocationHandler } = await import("./deleteLocation.handler");

    return deleteLocationHandler({ ctx, input });
  }),

  assignDate: authedProcedure.input(ZAssignDateInputSchema).mutation(async ({ input, ctx }) => {
    const { assignDateHandler } = await import("./assignDate.handler");

    return assignDateHandler({ ctx, input });
  }),

  setRecurringRules: authedProcedure.input(ZSetRecurringRulesInputSchema).mutation(async ({ input, ctx }) => {
    const { setRecurringRulesHandler } = await import("./setRecurringRules.handler");

    return setRecurringRulesHandler({ ctx, input });
  }),
});
