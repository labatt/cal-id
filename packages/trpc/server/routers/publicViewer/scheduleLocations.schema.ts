import { z } from "zod";

export const ZScheduleLocationsInputSchema = z.object({
  eventTypeId: z.number().int().positive(),
});

export type TScheduleLocationsInputSchema = z.infer<typeof ZScheduleLocationsInputSchema>;
