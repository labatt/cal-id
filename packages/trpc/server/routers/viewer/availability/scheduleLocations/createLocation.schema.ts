import { z } from "zod";

export const ZCreateLocationInputSchema = z.object({
  scheduleId: z.number().int().positive(),
  label: z.string().min(1).max(200),
  shortCode: z.string().min(1).max(4),
  type: z.string().min(1).max(100),
  address: z.string().max(500).nullish(),
  credentialId: z.number().int().positive().nullish(),
});

export type TCreateLocationInputSchema = z.infer<typeof ZCreateLocationInputSchema>;
