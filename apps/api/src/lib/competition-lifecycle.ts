import { type Prisma } from './db.js';
import * as audit from './audit.js';
import { hasCompleteAttemptSet } from '@streetlifting/domain';

export class CompetitionConflict extends Error {
  readonly statusCode = 409;
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** One lock order for protocol writers: competition, then nominations/attempts.
 * A no-op UPDATE also fences serializable snapshots that started before a waiter
 * acquired the lock. No timestamp or business value is changed.
 */
export async function lockCompetition(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<Array<{ status: string }>>`
    UPDATE competition SET "updatedAt" = "updatedAt" WHERE id = ${id}::uuid RETURNING status
  `;
  if (!rows[0]) throw new CompetitionConflict('competition_missing', 'Competition not found');
  return rows[0];
}

export async function lockEditableCompetition(tx: Prisma.TransactionClient, id: string) {
  const competition = await lockCompetition(tx, id);
  if (['finalized', 'archived'].includes(competition.status)) {
    throw new CompetitionConflict('competition_locked', 'Competition is finalized or archived');
  }
  return competition;
}

export function withCompetitionAudit<T>(
  entry: audit.AuditEntryFor & { scopeCompetitionId: string },
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return audit.withAudit(entry, async (tx) => {
    await lockEditableCompetition(tx, entry.scopeCompetitionId);
    return work(tx);
  });
}

export async function assertCompetitionTransition(
  tx: Prisma.TransactionClient,
  id: string,
  beforeStatus: string,
  nextStatus: string,
) {
  if (nextStatus === 'archived' && !['finalized', 'archived'].includes(beforeStatus)) {
    throw new CompetitionConflict('competition_not_finalized', 'Finalize before archiving');
  }
  if (
    (beforeStatus === 'archived' && nextStatus !== 'archived') ||
    (beforeStatus === 'finalized' && !['finalized', 'archived'].includes(nextStatus))
  ) {
    throw new CompetitionConflict('competition_status_locked', 'Competition cannot be reopened');
  }
  if (nextStatus === 'finalized' && beforeStatus !== 'finalized') {
    const nominations = await tx.nomination.findMany({
      where: { competitionId: id },
      select: {
        status: true,
        discipline: {
          select: { attemptCount: true, components: { select: { id: true, attemptCount: true } } },
        },
        attempts: { select: { componentId: true, attemptNumber: true, result: true } },
      },
    });
    if (nominations.some((n) => !['finished', 'disqualified', 'withdrawn'].includes(n.status))) {
      throw new CompetitionConflict(
        'competition_has_unfinished_nominations',
        'Active nominations are unfinished',
      );
    }
    if (
      nominations.some(
        (n) =>
          n.status === 'finished' &&
          !hasCompleteAttemptSet({
            discipline: n.discipline,
            components: n.discipline.components,
            attempts: n.attempts,
          }),
      )
    ) {
      throw new CompetitionConflict(
        'competition_protocol_incomplete',
        'Finished nominations need a complete protocol',
      );
    }
  }
  if (
    nextStatus === 'in_progress' &&
    beforeStatus !== 'in_progress' &&
    (await tx.competitionTeamMember.count({
      where: { competitionId: id, role: 'organizer', status: 'confirmed' },
    })) === 0
  ) {
    throw new CompetitionConflict(
      'organizer_required',
      'Confirm a competition organizer before starting',
    );
  }
}
