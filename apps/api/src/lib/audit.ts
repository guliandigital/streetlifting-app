import type { FastifyRequest } from 'fastify';
import { prisma, Prisma } from './db.js';
import { moduleLogger } from './logger.js';

const log = moduleLogger('audit');

export type AuditResult = 'success' | 'failure' | 'denied';

export interface AuditEntryInput {
  action: string;
  result: AuditResult;
  actorUserId: string | null;
  actorIp: string | null;
  actorUserAgent: string | null;
  scopeFederationId: string | null;
  scopeCompetitionId: string | null;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  requestId: string;
  notes?: string;
}

/**
 * Append-only audit log API. Backed by the `audit_log` table whose UPDATE
 * and DELETE are blocked by triggers (see migration 00000_initial).
 *
 * Sensitive actions MUST call `audit.record(...)` inside the same transaction
 * that performs the action. Use `withAudit(...)` to wire that up — if the
 * audit insert fails, the transaction rolls back and the action does not
 * happen. See ADR-0005 §"Failure handling".
 */
export async function record(
  entry: AuditEntryInput,
  tx: Prisma.TransactionClient = prisma,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: entry.action,
      result: entry.result,
      actorUserId: entry.actorUserId,
      actorIp: entry.actorIp,
      actorUserAgent: entry.actorUserAgent,
      scopeFederationId: entry.scopeFederationId,
      scopeCompetitionId: entry.scopeCompetitionId,
      targetType: entry.targetType,
      targetId: entry.targetId,
      before:
        entry.before === undefined || entry.before === null
          ? Prisma.DbNull
          : (entry.before as Prisma.InputJsonValue),
      after:
        entry.after === undefined || entry.after === null
          ? Prisma.DbNull
          : (entry.after as Prisma.InputJsonValue),
      requestId: entry.requestId,
      ...(entry.notes !== undefined && { notes: entry.notes }),
    },
  });
  log.debug(
    { action: entry.action, result: entry.result, requestId: entry.requestId },
    'audit recorded',
  );
}

export type AuditEntryFor = Omit<AuditEntryInput, 'result'> & {
  /** Computed by `withAudit` after the inner work succeeds or throws. */
  result?: never;
};

/**
 * Wraps a privileged operation. Runs `work` inside a Prisma transaction;
 * on success, records `result: 'success'`; on throw, records
 * `result: 'failure'` (with the error message captured in `notes`) and
 * re-throws so the outer code can respond.
 *
 * The transaction guarantees: if the audit insert itself fails, the
 * inner work is rolled back. There is no privileged write without an audit
 * trail.
 */
export async function withAudit<T>(
  entry: AuditEntryFor,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    try {
      const result = await work(tx);
      await record({ ...entry, result: 'success' } as AuditEntryInput, tx);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Record failure outside the doomed transaction — best-effort, since
      // the rollback discarded the in-tx record. This is a separate insert.
      void prisma.auditLog
        .create({
          data: {
            action: entry.action,
            result: 'failure',
            actorUserId: entry.actorUserId,
            actorIp: entry.actorIp,
            actorUserAgent: entry.actorUserAgent,
            scopeFederationId: entry.scopeFederationId,
            scopeCompetitionId: entry.scopeCompetitionId,
            targetType: entry.targetType,
            targetId: entry.targetId,
            before:
              entry.before === undefined || entry.before === null
                ? Prisma.DbNull
                : (entry.before as Prisma.InputJsonValue),
            after: Prisma.DbNull,
            requestId: entry.requestId,
            notes: `${entry.notes ?? ''} | error: ${message}`.trim(),
          },
        })
        .catch((logErr: unknown) =>
          log.error({ err: logErr, originalAction: entry.action }, 'audit failure-write failed'),
        );
      throw err;
    }
  });
}

export function fromRequest(req: FastifyRequest): Pick<
  AuditEntryInput,
  'actorUserId' | 'actorIp' | 'actorUserAgent' | 'requestId'
> {
  const ua = req.headers['user-agent'];
  return {
    actorUserId: null,
    actorIp: req.ip ?? null,
    actorUserAgent: typeof ua === 'string' ? ua.slice(0, 512) : null,
    requestId: req.requestId,
  };
}
