import { z } from 'zod';
import {
  NominationId,
  CompetitionId,
  AthleteId,
  DisciplineId,
  DivisionId,
  WeightClassId,
  FlightId,
  GroupId,
} from './ids.js';
import { NominationStatus } from './enums.js';

export const Nomination = z.object({
  id: NominationId,
  competitionId: CompetitionId,
  athleteId: AthleteId,
  disciplineId: DisciplineId,
  divisionId: DivisionId,
  weightClassId: WeightClassId,
  bodyWeightAtWeighIn: z.number().positive().nullable(),
  entryNumber: z.number().int().positive().nullable(),
  flightId: FlightId.nullable(),
  groupId: GroupId.nullable(),
  status: NominationStatus,
  isEntryFeePaid: z.boolean().default(false),
  isMandatePassed: z.boolean().default(false),
  bestSuccessfulAttemptKg: z.number().nullable(),
  finalScore: z.number().nullable(),
  placeInClass: z.number().int().positive().nullable(),
  placeInDivision: z.number().int().positive().nullable(),
  placeOverall: z.number().int().positive().nullable(),
  notes: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Nomination = z.infer<typeof Nomination>;
