import { createHash } from 'node:crypto';
import type { Prisma } from './db.js';
import { calculateNominationScore, calculateNominationPlaces } from '@streetlifting/domain';
import { CompetitionConflict } from './competition-lifecycle.js';

/** Canonical keys survive PostgreSQL JSONB key reordering. Array order is meaningful. */
export function snapshotHash(value: Prisma.JsonValue | Prisma.InputJsonValue): string {
  function canonical(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, child]) => [key, canonical(child)]),
      );
    return item;
  }
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

/** Caller holds the competition lock and has validated finalization in this transaction. */
export async function captureFinalizationSnapshot(
  tx: Prisma.TransactionClient,
  competitionId: string,
  actorUserId: string,
) {
  const competition = await tx.competition.findUniqueOrThrow({
    where: { id: competitionId },
    select: {
      id: true,
      federationId: true,
      code: true,
      nameRu: true,
      nameEn: true,
      rulebook: true,
      startDate: true,
      endDate: true,
      timezone: true,
      status: true,
    },
  });
  const nominations = await tx.nomination.findMany({
    where: { competitionId },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      athleteId: true,
      disciplineId: true,
      divisionId: true,
      weightClassId: true,
      entryNumber: true,
      status: true,
      bodyWeightAtWeighIn: true,
      isMandatePassed: true,
      bestSuccessfulAttemptKg: true,
      finalScore: true,
      placeInClass: true,
      placeInDivision: true,
      placeOverall: true,
      athlete: {
        select: {
          firstName: true,
          lastName: true,
          middleName: true,
          gender: true,
          countryCode: true,
        },
      },
      discipline: { include: { components: { orderBy: [{ order: 'asc' }, { id: 'asc' }] } } },
      division: true,
      weightClass: true,
      attempts: {
        orderBy: [{ componentId: 'asc' }, { attemptNumber: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          componentId: true,
          attemptNumber: true,
          weightKg: true,
          repsCount: true,
          result: true,
        },
      },
    },
  });
  const scoring = nominations.map((nomination) => ({
    ...nomination,
    components: nomination.discipline.components,
  }));
  const places = new Map(
    calculateNominationPlaces(scoring).map((place) => [place.nominationId, place]),
  );
  for (const nomination of scoring) {
    const score = calculateNominationScore(nomination);
    const place = places.get(nomination.id)!;
    if (
      (nomination.status === 'finished' &&
        (score.finalScore !== nomination.finalScore ||
          score.bestSuccessfulAttemptKg !== nomination.bestSuccessfulAttemptKg)) ||
      place.placeInClass !== nomination.placeInClass ||
      place.placeInDivision !== nomination.placeInDivision ||
      place.placeOverall !== nomination.placeOverall
    )
      throw new CompetitionConflict(
        'protocol_calculation_stale',
        'Saved results do not match current attempts and rules; review the protocol before finalization',
      );
  }
  const payload = JSON.parse(
    JSON.stringify({
      schemaVersion: 1,
      kind: 'operational_finalization',
      approvalStatus: 'not_recorded',
      calculationVersion: 'competition-scoring-v1',
      sourceCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      competition,
      nominations,
    }),
  ) as Prisma.InputJsonObject;
  return tx.competitionFinalizationSnapshot.create({
    data: {
      competitionId,
      revision: 1,
      schemaVersion: 1,
      createdByUserId: actorUserId,
      payloadHash: snapshotHash(payload),
      payload,
    },
  });
}
