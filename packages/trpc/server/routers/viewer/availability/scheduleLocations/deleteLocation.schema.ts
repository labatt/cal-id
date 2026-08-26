import { z } from "zod";

export const ZDeleteLocationInputSchema = z.object({
  scheduleId: z.number().int().positive(),
  locationId: z.number().int().positive(),
});

export type TDeleteLocationInputSchema = z.infer<typeof ZDeleteLocationInputSchema>;
