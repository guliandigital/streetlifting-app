import { protocolDataSchema, type CompetitionProtocol } from '@streetlifting/domain';
import { prisma } from './db.js';
import { snapshotHash } from './finalization-snapshot.js';
import { assertNoForbiddenExportKeys } from './privacy-allowlist.js';

/** Caller must authorize the same competition using the existing protocol export scope. */
export async function getCompetitionProtocol(competitionId: string): Promise<CompetitionProtocol> {
  return prisma.$transaction(
    async (tx) => {
      const competition = await tx.competition.findUniqueOrThrow({ where: { id: competitionId } });
      const snapshot = await tx.competitionFinalizationSnapshot.findFirst({
        where: { competitionId },
        orderBy: { revision: 'desc' },
      });
      let result: CompetitionProtocol;
      if (snapshot) {
        // Never silently replace corrupt or unknown historical evidence with mutable data.
        if (snapshot.schemaVersion !== 1 || snapshotHash(snapshot.payload) !== snapshot.payloadHash)
          throw new Error('Finalization snapshot integrity check failed');
        const data = protocolDataSchema.parse(snapshot.payload);
        if (data.competition.id !== competitionId)
          throw new Error('Finalization snapshot scope mismatch');
        result = {
          ...data,
          provenance: {
            source: 'finalization_snapshot',
            approvalStatus: 'not_recorded',
            revision: snapshot.revision,
            createdAt: snapshot.createdAt.toISOString(),
            payloadHash: snapshot.payloadHash,
          },
        };
      } else {
        const nominations = await tx.nomination.findMany({
          where: { competitionId },
          orderBy: { id: 'asc' },
          include: {
            athlete: { select: { firstName: true, lastName: true, middleName: true } },
            discipline: { include: { components: true } },
            division: true,
            weightClass: true,
            declaredWeightClass: true,
            attempts: {
              orderBy: [{ componentId: 'asc' }, { attemptNumber: 'asc' }, { id: 'asc' }],
            },
          },
        });
        result = {
          ...protocolDataSchema.parse({ competition, nominations }),
          provenance: {
            source: ['finalized', 'archived'].includes(competition.status)
              ? 'legacy_unverified'
              : 'working',
            approvalStatus: 'not_recorded',
            revision: null,
            createdAt: null,
            payloadHash: null,
          },
        };
      }
      result.nominations.sort(
        (a, b) =>
          (a.placeInClass ?? Infinity) - (b.placeInClass ?? Infinity) ||
          (b.finalScore ?? 0) - (a.finalScore ?? 0) ||
          (b.bestSuccessfulAttemptKg ?? 0) - (a.bestSuccessfulAttemptKg ?? 0) ||
          `${a.athlete.lastName} ${a.athlete.firstName}`.localeCompare(
            `${b.athlete.lastName} ${b.athlete.firstName}`,
          ) ||
          a.id.localeCompare(b.id),
      );
      assertNoForbiddenExportKeys(result);
      return result;
    },
    { isolationLevel: 'RepeatableRead' },
  );
}
