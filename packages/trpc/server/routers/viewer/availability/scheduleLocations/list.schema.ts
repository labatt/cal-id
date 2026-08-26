import { z } from "zod";

export const ZListInputSchema = z.object({ scheduleId: z.number().int().positive() });

export type TListInputSchema = z.infer<typeof ZListInputSchema>;
