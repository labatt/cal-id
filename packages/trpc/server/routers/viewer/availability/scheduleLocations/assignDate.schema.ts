import { z } from "zod";

export const ZAssignDateInputSchema = z.object({
  scheduleId: z.number().int().positive(),
  /**
   * A plain calendar date, not a serialized Date. A Date would carry a time and an offset,
   * and the day it lands on would depend on the sender's zone — which is exactly the class
   * of bug this feature exists to avoid.
   */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date"),
  scheduleLocationId: z.number().int().positive().nullable(),
});

export type TAssignDateInputSchema = z.infer<typeof ZAssignDateInputSchema>;
