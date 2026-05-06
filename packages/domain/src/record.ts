import { z } from 'zod';
import {
  RecordId,
  AthleteId,
  CompetitionId,
  DisciplineId,
  DivisionId,
  WeightClassId,
  FederationId,
  AttemptId,
} from './ids.js';

export const RecordScope = z.enum([
  'federation',
  'national',
  'continental',
  'world',
]);
export type RecordScope = z.infer<typeof RecordScope>;

/**
 * A record entry — best-ever performance for a (discipline × division ×
 * weight class × scope) combination. Updated when an attempt qualifies.
 *
 * Updates are audit-logged (see ADR-0005). Records are public read by default
 * unless the federation has set `isPublicResultsClosed`.
 */
export const Record = z.object({
  id: RecordId,
  scope: RecordScope,
  federationId: FederationId.nullable(),
  disciplineId: DisciplineId,
  divisionId: DivisionId,
  weightClassId: WeightClassId,
  athleteId: AthleteId,
  competitionId: CompetitionId,
  attemptId: AttemptId.nullable(),
  /** kg for classic, reps for multirep — interpretation depends on discipline format */
  result: z.number(),
  /** ISF points if applicable */
  pointsScore: z.number().nullable(),
  achievedOn: z.string().date(),
  ratifiedAt: z.string().datetime().nullable(),
  ratifiedByUserId: z.string().uuid().nullable(),
  notes: z.string().optional(),
});
export type Record = z.infer<typeof Record>;
