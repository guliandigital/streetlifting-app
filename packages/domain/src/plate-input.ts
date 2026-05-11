import { z } from 'zod';
import { PlateColor } from './enums.js';

export const PlateInput = z
  .object({
    weightKg: z.number().positive().max(100),
    pairCount: z.number().int().nonnegative().max(50),
    color: PlateColor,
    recordOnly: z.boolean().default(false),
  })
  .strict();
export type PlateInput = z.infer<typeof PlateInput>;

export const PlateSetCreate = z
  .object({
    name: z.string().min(1).max(120),
    incrementKg: z.number().positive().max(10).default(1.25),
    barWeightKg: z.number().nonnegative().max(100).default(20),
    collarWeightKg: z.number().nonnegative().max(20).default(2.5),
    plates: z.array(PlateInput).max(40).default([]),
  })
  .strict();
export type PlateSetCreate = z.infer<typeof PlateSetCreate>;

export const PlateSetUpdate = PlateSetCreate.partial().strict();
export type PlateSetUpdate = z.infer<typeof PlateSetUpdate>;
