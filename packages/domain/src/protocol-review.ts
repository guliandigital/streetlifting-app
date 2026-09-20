import { z } from 'zod';
import { DisciplineFormat, AttemptResult } from './enums.js';
import { protocolDataSchema } from './protocol.js';
import {
  calculateNominationScore,
  calculateNominationPlaces,
  calculateNominationPlacesV1,
  hasCompleteAttemptSet,
} from './competition-scoring.js';

const reason = z.string().trim().min(10).max(2000);
const base = { expectedRevision: z.number().int().positive(), reason };
const reference = z.string().trim().min(3).max(2000);
export const protocolApprovalEvidence = z
  .object({
    signedProtocolReference: reference,
    headJudgeSigned: z.literal(true),
    chiefSecretarySigned: z.literal(true),
  })
  .strict();
export const recordReviewEvidence = z
  .object({
    sanctionReference: reference,
    judgingReference: reference,
    weightReference: reference,
    equipmentReference: reference,
    videoReference: reference,
    registryReference: reference,
    previousBest: z.number().finite().nonnegative().nullable(),
    categoryAndAttemptEligibilityConfirmed: z.literal(true),
  })
  .strict();
export const protocolReviewCommand = z.discriminatedUnion('action', [
  z.object({ ...base, action: z.literal('approve'), evidence: protocolApprovalEvidence }).strict(),
  z
    .object({
      ...base,
      action: z.literal('correct'),
      sourceReference: reference,
      clericalCorrectionOnly: z.literal(true),
      nominationId: z.string().uuid(),
      attemptId: z.string().uuid(),
      weightKg: z.number().finite().min(0).max(1000),
      repsCount: z.number().int().min(0).max(10000).nullable(),
      result: z.enum(['good_lift', 'no_lift', 'withdrawn']),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal('reweigh'),
      sourceReference: reference,
      weights: z
        .array(
          z
            .object({
              nominationId: z.string().uuid(),
              weightKg: z.number().finite().positive().max(500),
            })
            .strict(),
        )
        .min(1)
        .max(5000),
    })
    .strict(),
  z.object({ ...base, action: z.literal('candidates') }).strict(),
  z
    .object({
      ...base,
      action: z.literal('review'),
      candidateId: z.string().uuid(),
      decision: z.enum(['verified', 'rejected']),
      evidence: recordReviewEvidence.optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal('ratify'),
      achievedOn: z.string().date(),
      candidateId: z.string().uuid(),
    })
    .strict(),
  z.object({ ...base, action: z.literal('issue'), nominationId: z.string().uuid() }).strict(),
]);
export type ProtocolReviewCommand = z.infer<typeof protocolReviewCommand>;

export interface ProtocolReviewResponse {
  snapshots: Array<{
    id: string;
    revision: number;
    createdAt: string;
    payloadHash: string;
    payload: unknown;
    approval: { id: string; approvedAt: string; reason: string } | null;
    recordReviews: Array<{
      id: string;
      nominationId: string;
      status: string;
      reviewReason: string | null;
      recordId: string | null;
    }>;
    issuedDocuments: Array<{
      id: string;
      nominationId: string;
      version: number;
      issuedAt: string;
      previousDocumentId: string | null;
    }>;
  }>;
}

// Historical calculation inputs, not current directory entries. Passthrough preserves
// the rest of the original evidence when a narrowly scoped correction is appended.
export const reviewSnapshotSchema = protocolDataSchema
  .extend({
    schemaVersion: z.literal(1),
    calculationVersion: z.enum(['competition-scoring-v1', 'competition-scoring-v2']),
    competition: protocolDataSchema.shape.competition
      .extend({ federationId: z.string().uuid(), startDate: z.string(), endDate: z.string() })
      .passthrough(),
    nominations: z.array(
      protocolDataSchema.shape.nominations.element
        .extend({
          reweighWeightKg: z.number().finite().positive().optional(),
          athleteId: z.string().uuid(),
          disciplineId: z.string().uuid(),
          divisionId: z.string().uuid(),
          weightClassId: z.string().uuid(),
          discipline: protocolDataSchema.shape.nominations.element.shape.discipline
            .extend({
              format: DisciplineFormat,
              attemptCount: z.number().int(),
              fixedWeightKg: z.number().nullable(),
              components: z.array(
                z
                  .object({
                    id: z.string(),
                    code: z.string(),
                    attemptCount: z.number().int(),
                    fixedWeightKg: z.number().nullable(),
                  })
                  .passthrough(),
              ),
            })
            .passthrough(),
          athlete: protocolDataSchema.shape.nominations.element.shape.athlete.passthrough(),
          division: protocolDataSchema.shape.nominations.element.shape.division.passthrough(),
          weightClass: protocolDataSchema.shape.nominations.element.shape.weightClass.passthrough(),
          attempts: z.array(
            protocolDataSchema.shape.nominations.element.shape.attempts.element
              .extend({ result: AttemptResult })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export function correctProtocol(
  payload: unknown,
  command: Extract<ProtocolReviewCommand, { action: 'correct' }>,
) {
  const data = reviewSnapshotSchema.parse(payload);
  const nomination = data.nominations.find((n) => n.id === command.nominationId);
  const attempt = nomination?.attempts.find((a) => a.id === command.attemptId);
  if (!nomination || !attempt) throw new Error('Попытка не найдена в этой версии протокола');
  const fixed =
    nomination.discipline.components.find((c) => c.id === attempt.componentId)?.fixedWeightKg ??
    nomination.discipline.fixedWeightKg;
  if (fixed !== null && command.weightKg !== fixed)
    throw new Error('Вес не соответствует сохранённому регламенту');
  if (
    nomination.discipline.format !== 'three_attempts_max' &&
    command.result === 'good_lift' &&
    command.repsCount === null
  )
    throw new Error('Укажите число повторений / время для этой дисциплины');
  if (
    attempt.weightKg === command.weightKg &&
    attempt.repsCount === command.repsCount &&
    attempt.result === command.result
  )
    throw new Error('Попытка не изменена');
  Object.assign(attempt, {
    weightKg: command.weightKg,
    repsCount: command.repsCount,
    result: command.result,
  });
  const scoring = data.nominations.map((n) => ({ ...n, components: n.discipline.components }));
  for (const n of scoring) {
    if (n.status === 'finished' && !hasCompleteAttemptSet(n))
      throw new Error('Неполный набор попыток');
    if (n.status !== 'finished') continue;
    const score = calculateNominationScore(n);
    n.finalScore = score.finalScore;
    n.bestSuccessfulAttemptKg = score.bestSuccessfulAttemptKg;
  }
  const calculator =
    data.calculationVersion === 'competition-scoring-v1'
      ? calculateNominationPlacesV1
      : calculateNominationPlaces;
  const places = new Map(calculator(scoring).map((p) => [p.nominationId, p]));
  data.nominations = scoring.map(({ components: _components, ...n }) => ({
    ...n,
    placeInClass: places.get(n.id)!.placeInClass,
    placeInDivision: places.get(n.id)!.placeInDivision,
    placeOverall: places.get(n.id)!.placeOverall,
  }));
  return {
    ...data,
    kind: 'protocol_correction',
    approvalStatus: 'not_recorded',
    correction: {
      previousRevision: command.expectedRevision,
      reason: command.reason,
      nominationId: command.nominationId,
      attemptId: command.attemptId,
      sourceReference: command.sourceReference,
      clericalCorrectionOnly: command.clericalCorrectionOnly,
    },
  };
}

/** ISF v5.1 sections 7.7 and 10.3; central ISF recognition remains external. */
export function validateRecordEvidence(format: string, result: number, value: unknown) {
  const evidence = recordReviewEvidence.parse(value);
  if (!['three_attempts_max', 'reps_to_failure', 'reps_in_time'].includes(format))
    throw new Error('Для этой дисциплины требуется отдельный регламент рекордов');
  const increment = format === 'three_attempts_max' ? 1.25 : 1;
  if (evidence.previousBest !== null && result < evidence.previousBest + increment)
    throw new Error(`Превышение действующего рекорда должно составлять не менее ${increment}`);
  return evidence;
}

export function reweighProtocol(
  payload: unknown,
  command: Extract<ProtocolReviewCommand, { action: 'reweigh' }>,
) {
  const data = reviewSnapshotSchema.parse(payload);
  if (data.calculationVersion !== 'competition-scoring-v2')
    throw new Error('Историческая версия расчёта не поддерживает перевзвешивание');
  const ids = new Set<string>();
  for (const weight of command.weights) {
    const n = data.nominations.find((n) => n.id === weight.nominationId);
    if (!n || ids.has(n.id) || n.status !== 'finished')
      throw new Error('Некорректный список перевзвешивания');
    ids.add(n.id);
    n.reweighWeightKg = weight.weightKg;
  }
  const places = new Map(
    calculateNominationPlaces(
      data.nominations.map((n) => ({ ...n, components: n.discipline.components })),
    ).map((p) => [p.nominationId, p]),
  );
  data.nominations = data.nominations.map((n) => ({ ...n, ...places.get(n.id) }));
  return {
    ...data,
    approvalStatus: 'not_recorded',
    kind: 'protocol_reweigh',
    correction: {
      previousRevision: command.expectedRevision,
      reason: command.reason,
      sourceReference: command.sourceReference,
    },
  };
}

export function requireResolvedTies(payload: ReturnType<typeof reviewSnapshotSchema.parse>) {
  const eligible = payload.nominations.filter(
    (n) => n.status === 'finished' && n.finalScore !== null,
  );
  for (const n of eligible) {
    const tied = eligible.some(
      (other) =>
        other.id !== n.id &&
        other.disciplineId === n.disciplineId &&
        other.finalScore === n.finalScore &&
        other.bodyWeightAtWeighIn === n.bodyWeightAtWeighIn,
    );
    if (
      tied &&
      (payload.calculationVersion !== 'competition-scoring-v2' || n.reweighWeightKg === undefined)
    )
      throw new Error('Равные результат и собственный вес: внесите перевзвешивание по §7.10 ISF');
  }
}
