import { z } from 'zod';
import { CompetitionId, FederationId, DisciplineId } from './ids.js';
import { CompetitionStatus } from './enums.js';

export const Competition = z.object({
  id: CompetitionId,
  federationId: FederationId,
  code: z.string().min(1),
  nameRu: z.string().min(1),
  nameEn: z.string().min(1),
  description: z.string().optional(),
  rulebook: z.string().default('ISF v5.1'),
  startDate: z.string().date(),
  endDate: z.string().date(),
  registrationDeadline: z.string().datetime().optional(),
  city: z.string().optional(),
  venue: z.string().optional(),
  status: CompetitionStatus,
  entryFeeRub: z.number().nonnegative().default(0),
  disciplineIds: z.array(DisciplineId).default([]),
  isOnlineRegistrationOpen: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Competition = z.infer<typeof Competition>;
