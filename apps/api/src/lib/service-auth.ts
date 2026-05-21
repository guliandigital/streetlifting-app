import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { ApiServiceClient } from '@prisma/client';
import { prisma } from './db.js';
import * as audit from './audit.js';
import { sha256Hex } from './stable-json.js';

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const TOKEN_PREFIX = 'slisf_';
const WINDOW_MS = 60_000;

interface RateBucket {
  windowStart: number;
  count: number;
}

const rateBuckets = new Map<string, RateBucket>();

declare module 'fastify' {
  interface FastifyRequest {
    serviceClient?: ApiServiceClient;
  }
}

export function createServiceToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function hashServiceToken(token: string): string {
  return sha256Hex(token);
}

export function publicServiceClient(client: ApiServiceClient) {
  return {
    id: client.id,
    code: client.code,
    name: client.name,
    scopes: client.scopes,
    isActive: client.isActive,
    rateLimitRpm: client.rateLimitRpm,
    createdAt: client.createdAt.toISOString(),
    revokedAt: client.revokedAt?.toISOString() ?? null,
  };
}

function bearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

function checkRateLimit(
  client: ApiServiceClient,
  nowMs: number,
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const current = rateBuckets.get(client.id);
  if (!current || nowMs - current.windowStart >= WINDOW_MS) {
    rateBuckets.set(client.id, { windowStart: nowMs, count: 1 });
    return { ok: true };
  }

  if (current.count >= client.rateLimitRpm) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((WINDOW_MS - (nowMs - current.windowStart)) / 1000),
    );
    return { ok: false, retryAfterSeconds };
  }

  current.count += 1;
  return { ok: true };
}

async function recordServiceAudit(
  req: FastifyRequest,
  action: string,
  result: audit.AuditResult,
  targetId: string,
  notes?: string,
): Promise<void> {
  await audit.record({
    ...audit.fromRequest(req),
    actorUserId: null,
    action,
    result,
    scopeFederationId: null,
    scopeCompetitionId: null,
    targetType: 'api_service_client',
    targetId,
    before: null,
    after: {
      method: req.method,
      url: req.url,
    },
    ...(notes !== undefined && { notes }),
  });
}

function hasRequiredScope(client: ApiServiceClient, allowedScopes: readonly string[]): boolean {
  return allowedScopes.some((scope) => client.scopes.includes(scope));
}

export function requireServiceClient(allowedScopes: readonly string[]): preHandlerHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin.length > 0) {
      await recordServiceAudit(
        req,
        'isf.service_request.browser_origin_denied',
        'denied',
        ZERO_UUID,
      );
      return reply.code(403).send({
        error: {
          code: 'browser_cors_forbidden',
          message: 'Service endpoints do not allow browser-origin requests',
          requestId: req.requestId,
        },
      });
    }

    const token = bearerToken(req);
    if (!token) {
      await recordServiceAudit(req, 'isf.service_request.missing_token', 'denied', ZERO_UUID);
      return reply.code(401).send({
        error: {
          code: 'unauthorized',
          message: 'Service token required',
          requestId: req.requestId,
        },
      });
    }

    const tokenHash = hashServiceToken(token);
    const client = await prisma.apiServiceClient.findFirst({
      where: {
        tokenHash,
        isActive: true,
        revokedAt: null,
      },
    });

    if (!client) {
      await recordServiceAudit(req, 'isf.service_request.invalid_token', 'denied', ZERO_UUID);
      return reply.code(401).send({
        error: {
          code: 'unauthorized',
          message: 'Invalid service token',
          requestId: req.requestId,
        },
      });
    }

    if (!hasRequiredScope(client, allowedScopes)) {
      await recordServiceAudit(req, 'isf.service_request.scope_denied', 'denied', client.id);
      return reply.code(403).send({
        error: {
          code: 'insufficient_scope',
          message: 'Service token scope is not allowed for this endpoint',
          requestId: req.requestId,
        },
      });
    }

    const rateLimit = checkRateLimit(client, Date.now());
    if (!rateLimit.ok) {
      reply.header('retry-after', String(rateLimit.retryAfterSeconds));
      await recordServiceAudit(req, 'isf.service_request.rate_limited', 'denied', client.id);
      return reply.code(429).send({
        error: {
          code: 'rate_limited',
          message: 'Service client rate limit exceeded',
          requestId: req.requestId,
        },
      });
    }

    req.serviceClient = client;
    await recordServiceAudit(req, 'isf.service_request.authenticated', 'success', client.id);
  };
}
