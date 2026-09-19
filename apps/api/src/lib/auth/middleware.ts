import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import { prisma } from '../db.js';
import { verifyAccessToken } from './tokens.js';
import type { Role } from '@prisma/client';
import {
  ACCESS_ACKNOWLEDGMENT_VERSION,
  roleRequiresAcknowledgment,
} from '../access-acknowledgment.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser | null;
  }
}

export interface PendingRoleAcknowledgment {
  roleAssignmentId: string;
  role: Role;
  federationId: string | null;
  competitionId: string | null;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  /**
   * Active role assignments materialized at request time. Tokens never carry
   * roles so a revocation takes effect on the next request, not the next
   * login. Roles that touch other people's personal data are listed only
   * after the holder accepted the confidentiality acknowledgment (152-ФЗ
   * art. 7); until then they appear in `pendingAcknowledgments` instead.
   */
  roles: Array<{
    role: Role;
    federationId: string | null;
    competitionId: string | null;
  }>;
  pendingAcknowledgments?: PendingRoleAcknowledgment[];
}

/**
 * Materialize a user and active roles from an access token. HTTP requests use
 * Authorization; browser WebSockets pass the token in Sec-WebSocket-Protocol
 * because browsers do not permit arbitrary upgrade headers.
 */
export async function authenticateAccessToken(
  token: string | null | undefined,
): Promise<AuthenticatedUser | null> {
  if (!token) return null;
  const claims = await verifyAccessToken(token);
  if (!claims) return null;

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    include: {
      roleAssignments: {
        where: { revokedAt: null },
        select: {
          id: true,
          role: true,
          federationId: true,
          competitionId: true,
          acknowledgedAt: true,
          acknowledgedTextVersion: true,
        },
      },
    },
  });
  if (!user) return null;

  const roles: AuthenticatedUser['roles'] = [];
  const pendingAcknowledgments: PendingRoleAcknowledgment[] = [];
  for (const assignment of user.roleAssignments) {
    const acknowledged =
      !roleRequiresAcknowledgment(assignment.role) ||
      (assignment.acknowledgedAt !== null &&
        assignment.acknowledgedTextVersion === ACCESS_ACKNOWLEDGMENT_VERSION);
    if (acknowledged) {
      roles.push({
        role: assignment.role,
        federationId: assignment.federationId,
        competitionId: assignment.competitionId,
      });
    } else {
      pendingAcknowledgments.push({
        roleAssignmentId: assignment.id,
        role: assignment.role,
        federationId: assignment.federationId,
        competitionId: assignment.competitionId,
      });
    }
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles,
    pendingAcknowledgments,
  };
}

/**
 * preHandler: extract Bearer token, verify, materialize user + active roles.
 * Sets `req.user = null` when there is no/invalid token but does NOT 401 —
 * use `requireAuth` to enforce. This split lets routes opt in to optional
 * auth (e.g. public read with a personalized variant when logged in).
 */
export const attachUser: preHandlerHookHandler = async (req: FastifyRequest) => {
  req.user = null;

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return;

  req.user = await authenticateAccessToken(token);
};

/** Enforce that `req.user` is set (after `attachUser`). 401 if not. */
export function requireAuth(): preHandlerHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) {
      await reply.code(401).send({
        error: {
          code: 'unauthorized',
          message: 'Authentication required',
          requestId: req.requestId,
        },
      });
    }
  };
}

export interface RequireRoleOptions {
  /** When set, the caller must hold the role scoped to this federation. */
  federationId?: string;
  /** When set, the caller must hold the role scoped to this competition. */
  competitionId?: string;
}

/**
 * Enforce that the caller holds `role` (or any of `roles`) in the requested
 * scope. Default is "global" — the role assignment must have NULL scope.
 *
 * Default-deny: if the user is unauthenticated, returns 401. If authenticated
 * without the role, 403.
 */
export function requireRole(
  roles: Role | Role[],
  options: RequireRoleOptions = {},
): preHandlerHookHandler {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) {
      await reply.code(401).send({
        error: {
          code: 'unauthorized',
          message: 'Authentication required',
          requestId: req.requestId,
        },
      });
      return;
    }
    const ok = req.user.roles.some(
      (r) =>
        allowed.includes(r.role) &&
        (options.federationId ? r.federationId === options.federationId : true) &&
        (options.competitionId ? r.competitionId === options.competitionId : true),
    );
    if (!ok) {
      await reply.code(403).send({
        error: { code: 'forbidden', message: 'Insufficient role', requestId: req.requestId },
      });
    }
  };
}
