import type { FastifyRequest } from 'fastify';
import { moduleLogger } from './logger.js';

const log = moduleLogger('audit');

/**
 * Append-only audit log API.
 *
 * Sensitive actions MUST call `audit.record()` inside the same transaction
 * that performs the action. If the audit insert fails, the action's
 * transaction is rolled back — see ADR-0005 §"Failure handling".
 *
 * In M0 this writes to the operational log with a marker so we can grep.
 * At M1 it switches to an `audit_log` Prisma table inside a wrapping
 * transaction; the public API stays the same.
 */
export interface AuditEntry {
  action: string;
  result: 'success' | 'failure' | 'denied';
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

export async function record(entry: AuditEntry): Promise<void> {
  log.info({ audit: true, ...entry }, `audit:${entry.action}:${entry.result}`);
  // M1: replace with `prisma.auditLog.create({ data: { ... } })` inside the
  // caller's transaction. The current implementation is a marker so the
  // call sites can be wired now and the storage swapped without churn.
}

export function fromRequest(req: FastifyRequest): Pick<
  AuditEntry,
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
