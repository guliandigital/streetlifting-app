import { z } from 'zod';
import { AttemptResult, NominationStatus, PaymentMethod, PaymentStatus } from './enums.js';

const Uuid = z.string().uuid();
const OptionalNullableUuid = Uuid.nullable().optional();
const OptionalNullableText = z.string().max(2000).nullable().optional();
const Kopecks = z.number().int().nonnegative();

export const CompetitionDefaultSetup = z
  .object({
    platformName: z.string().min(1).max(120).default('Main platform'),
    flightCode: z.string().min(1).max(32).default('A'),
    flightName: z.string().min(1).max(120).default('Flight A'),
  })
  .strict();
export type CompetitionDefaultSetup = z.infer<typeof CompetitionDefaultSetup>;

export const NominationCreate = z
  .object({
    athleteId: Uuid,
    disciplineId: Uuid,
    divisionId: Uuid,
    declaredWeightClassId: OptionalNullableUuid,
    weightClassId: Uuid,
    bodyWeightAtWeighIn: z.number().positive().nullable().optional(),
    entryNumber: z.number().int().positive().nullable().optional(),
    flightId: OptionalNullableUuid,
    groupId: OptionalNullableUuid,
    status: NominationStatus.default('draft'),
    isEntryFeePaid: z.boolean().default(false),
    paymentStatus: PaymentStatus.default('unpaid'),
    paidAmountKopecks: Kopecks.default(0),
    paymentMethod: PaymentMethod.nullable().optional(),
    paymentComment: OptionalNullableText,
    paidAt: z.string().datetime().nullable().optional(),
    isMandatePassed: z.boolean().default(false),
    notes: z.string().max(2000).optional(),
  })
  .strict();
export type NominationCreate = z.infer<typeof NominationCreate>;

export const NominationUpdate = z
  .object({
    bodyWeightAtWeighIn: z.number().positive().nullable().optional(),
    entryNumber: z.number().int().positive().nullable().optional(),
    declaredWeightClassId: OptionalNullableUuid,
    weightClassId: OptionalNullableUuid,
    flightId: OptionalNullableUuid,
    groupId: OptionalNullableUuid,
    status: NominationStatus.optional(),
    isEntryFeePaid: z.boolean().optional(),
    paymentStatus: PaymentStatus.optional(),
    paidAmountKopecks: Kopecks.optional(),
    paymentMethod: PaymentMethod.nullable().optional(),
    paymentComment: OptionalNullableText,
    paidAt: z.string().datetime().nullable().optional(),
    isMandatePassed: z.boolean().optional(),
    notes: OptionalNullableText,
  })
  .strict();
export type NominationUpdate = z.infer<typeof NominationUpdate>;

export const AttemptUpsert = z
  .object({
    componentId: OptionalNullableUuid,
    attemptNumber: z.number().int().min(1).max(5),
    weightKg: z.number().nonnegative(),
    result: AttemptResult.default('pending'),
    judgeDecisions: z.array(z.unknown()).default([]),
    repsCount: z.number().int().nonnegative().nullable().optional(),
    timeoutSeconds: z.number().int().nonnegative().nullable().optional(),
    startedAt: z.string().datetime().nullable().optional(),
    decidedAt: z.string().datetime().nullable().optional(),
    notes: OptionalNullableText,
  })
  .strict();
export type AttemptUpsert = z.infer<typeof AttemptUpsert>;

export const NominationDraw = z
  .object({
    overwrite: z.boolean().default(false),
  })
  .strict();
export type NominationDraw = z.infer<typeof NominationDraw>;

export const FlightAutoPlan = z
  .object({
    platformName: z.string().min(1).max(120).default('Main platform'),
    startAt: z.string().datetime().optional(),
    minutesPerAttempt: z.number().int().min(1).max(10).default(1),
    breakBetweenFlightsMinutes: z.number().int().min(0).max(60).default(5),
    maxNominationsPerGroup: z.number().int().min(1).max(30).default(12),
  })
  .strict();
export type FlightAutoPlan = z.infer<typeof FlightAutoPlan>;
