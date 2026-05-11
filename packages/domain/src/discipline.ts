import { z } from 'zod';
import { DisciplineComponentId, DisciplineId } from './ids.js';
import { DisciplineFamily, DisciplineFormat, Equipment } from './enums.js';

export const DisciplineComponent = z.object({
  id: DisciplineComponentId,
  disciplineId: DisciplineId,
  code: z.string().min(1),
  nameRu: z.string().min(1),
  nameEn: z.string().min(1),
  equipment: Equipment,
  order: z.number().int().positive(),
  attemptCount: z.number().int().min(1).max(5).default(3),
  fixedWeightKg: z.number().nonnegative().nullable(),
});
export type DisciplineComponent = z.infer<typeof DisciplineComponent>;

export const Discipline = z.object({
  id: DisciplineId,
  code: z.string().min(2),
  nameRu: z.string().min(1),
  nameEn: z.string().min(1),
  family: DisciplineFamily,
  format: DisciplineFormat,
  equipment: Equipment,
  attemptCount: z.number().int().min(1).max(5).default(3),
  fixedWeightKg: z.number().nonnegative().nullable(),
  applyVeteranCoefficient: z.boolean().default(true),
});
export type Discipline = z.infer<typeof Discipline>;
