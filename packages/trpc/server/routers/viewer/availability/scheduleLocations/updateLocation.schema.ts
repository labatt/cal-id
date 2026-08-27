import { z } from "zod";

export const ZUpdateLocationInputSchema = z.object({
  scheduleId: z.number().int().positive(),
  locationId: z.number().int().positive(),
  label: z.string().min(1).max(200),
  shortCode: z.string().min(1).max(4),
  compactCode: z.string().max(2).nullish(),
  type: z.string().min(1).max(100),
  address: z.string().max(500).nullish(),
});

export type TUpdateLocationInputSchema = z.infer<typeof ZUpdateLocationInputSchema>;
