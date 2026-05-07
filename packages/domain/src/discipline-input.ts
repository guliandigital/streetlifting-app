import { z } from 'zod';
import { DisciplineFamily, DisciplineFormat, Equipment } from './enums.js';

export const DisciplineCreate = z
  .object({
    code: z.string().min(2).max(64),
    nameRu: z.string().min(1).max(200),
    nameEn: z.string().min(1).max(200),
    family: DisciplineFamily,
    format: DisciplineFormat,
    equipment: Equipment,
    attemptCount: z.number().int().min(1).max(5).default(3),
    fixedWeightKg: z.number().nonnegative().nullable().default(null),
    applyVeteranCoefficient: z.boolean().default(true),
  })
  .strict();
export type DisciplineCreate = z.infer<typeof DisciplineCreate>;

export const DisciplineUpdate = z
  .object({
    nameRu: z.string().min(1).max(200).optional(),
    nameEn: z.string().min(1).max(200).optional(),
    family: DisciplineFamily.optional(),
    format: DisciplineFormat.optional(),
    equipment: Equipment.optional(),
    attemptCount: z.number().int().min(1).max(5).optional(),
    fixedWeightKg: z.number().nonnegative().nullable().optional(),
    applyVeteranCoefficient: z.boolean().optional(),
  })
  .strict();
export type DisciplineUpdate = z.infer<typeof DisciplineUpdate>;
