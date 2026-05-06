import { z } from 'zod';
import { CompetitionId, DivisionId, WeightClassId, DisciplineId } from './ids.js';
import { Gender, VeteranTier } from './enums.js';

export const Division = z.object({
  id: DivisionId,
  competitionId: CompetitionId,
  code: z.string().min(1),
  nameRu: z.string().min(1),
  nameEn: z.string().min(1),
  gender: Gender,
  veteranTier: VeteranTier,
  ageMin: z.number().int().nonnegative().nullable(),
  ageMax: z.number().int().nonnegative().nullable(),
  veteranCoefficient: z.number().positive().default(1.0),
});
export type Division = z.infer<typeof Division>;

export const WeightClass = z.object({
  id: WeightClassId,
  divisionId: DivisionId,
  disciplineId: DisciplineId.nullable(),
  code: z.string().min(1),
  nameRu: z.string().min(1),
  nameEn: z.string().min(1),
  weightMin: z.number().nonnegative().nullable(),
  weightMax: z.number().nonnegative().nullable(),
  order: z.number().int(),
});
export type WeightClass = z.infer<typeof WeightClass>;
