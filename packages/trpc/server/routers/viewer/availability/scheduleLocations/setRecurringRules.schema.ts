import { z } from "zod";

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected a HH:mm time")
  .nullable();

export const ZSetRecurringRulesInputSchema = z.object({
  scheduleId: z.number().int().positive(),
  rules: z
    .array(
      z.object({
        scheduleLocationId: z.number().int().positive(),
        days: z.array(z.number().int().min(0).max(6)).max(7),
        startTime: timeOfDay,
        endTime: timeOfDay,
        locked: z.boolean(),
      })
    )
    .max(50),
});

export type TSetRecurringRulesInputSchema = z.infer<typeof ZSetRecurringRulesInputSchema>;
