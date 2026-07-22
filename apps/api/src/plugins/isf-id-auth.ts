import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma, Prisma } from '../lib/db.js';
import * as audit from '../lib/audit.js';
import { requireAuth } from '../lib/auth/middleware.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  issueRefreshToken,
  signAccessToken,
} from '../lib/auth/tokens.js';
import {
  IsfIdConfigurationError,
  isIsfIdEnabled,
  verifyIsfIdAssertion,
  type VerifiedIsfIdAssertion,
} from '../lib/auth/isf-id.js';

const IsfSessionBody = z
  .object({
    token: z.string().min(1).max(16_384),
  })
  .strict();

class IsfIdentityLinkRequiredError extends Error {
  constructor() {
    super('A local account with this verified email must be linked while signed in');
    this.name = 'IsfIdentityLinkRequiredError';
  }
}

class IsfAssertionReusedError extends Error {
  constructor() {
    super('This ISF ID assertion has already been used');
    this.name = 'IsfAssertionReusedError';
  }
}

async function issueLocalSession(userId: string, req: FastifyRequest) {
  const accessToken = await signAccessToken(userId);
  const refresh = await issueRefreshToken(userId, {
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  });
  return {
    accessToken,
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: refresh.opaque,
    refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
  };
}

async function consumeAssertion(
  assertion: VerifiedIsfIdAssertion,
  req: FastifyRequest,
  userId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  try {
    await tx.isfSsoAssertion.create({
      data: {
        issuer: assertion.issuer,
        jti: assertion.jti,
        subjectId: assertion.subjectId,
        audience: assertion.audience,
        expiresAt: assertion.expiresAt,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new IsfAssertionReusedError();
    }
    throw err;
  }

  await audit.record(
    {
      ...audit.fromRequest(req),
      actorUserId: userId,
      action: 'auth.isf.assertion_consumed',
      result: 'success',
      scopeFederationId: null,
      scopeCompetitionId: null,
      targetType: 'user',
      targetId: userId,
      before: null,
      after: { isfSubjectId: assertion.subjectId },
    },
    tx,
  );
}

function sendAssertionError(reply: FastifyReply, requestId: string, err: unknown) {
  const code =
    err instanceof IsfIdConfigurationError ? 'isf_id_unavailable' : 'invalid_isf_assertion';
  const status = err instanceof IsfIdConfigurationError ? 503 : 401;
  return reply.code(status).send({
    error: { code, message: 'ISF ID authentication was not accepted', requestId },
  });
}

export const isfIdAuthPlugin: FeaturePlugin = {
  name: 'isf-id-auth',
  register: async (app) => {
    app.get('/health/auth/isf-id', async () => ({
      status: 'ok',
      module: 'auth-isf-id',
      enabled: isIsfIdEnabled(),
    }));

    app.get('/auth/isf/status', { preHandler: requireAuth() }, async (req) => {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { isfSubjectId: true },
      });
      return { enabled: isIsfIdEnabled(), isfSubjectId: user?.isfSubjectId ?? null };
    });

    app.post(
      '/auth/isf/session',
      { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
      async (req, reply) => {
        const parsed = IsfSessionBody.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }

        let assertion: VerifiedIsfIdAssertion;
        try {
          assertion = await verifyIsfIdAssertion(parsed.data.token);
        } catch (err) {
          return sendAssertionError(reply, req.requestId, err);
        }

        try {
          const user = await prisma.$transaction(async (tx) => {
            const linked = await tx.user.findUnique({
              where: { isfSubjectId: assertion.subjectId },
            });
            const emailOwner = linked
              ? null
              : await tx.user.findFirst({
                  where: { email: { equals: assertion.email, mode: 'insensitive' } },
                });

            if (!linked && emailOwner) throw new IsfIdentityLinkRequiredError();

            const localUser =
              linked ??
              (await tx.user.create({
                data: {
                  email: assertion.email,
                  displayName: assertion.displayName,
                  isEmailVerified: true,
                  isfSubjectId: assertion.subjectId,
                },
              }));

            await consumeAssertion(assertion, req, localUser.id, tx);
            return localUser;
          });

          const tokens = await issueLocalSession(user.id, req);
          return reply.send({
            user: {
              id: user.id,
              email: user.email,
              displayName: user.displayName,
              isfSubjectId: user.isfSubjectId,
            },
            ...tokens,
          });
        } catch (err) {
          if (err instanceof IsfIdentityLinkRequiredError) {
            return reply.code(409).send({
              error: {
                code: 'isf_identity_link_required',
                message: err.message,
                requestId: req.requestId,
              },
            });
          }
          if (err instanceof IsfAssertionReusedError) {
            return reply.code(409).send({
              error: {
                code: 'isf_assertion_reused',
                message: err.message,
                requestId: req.requestId,
              },
            });
          }
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return reply.code(409).send({
              error: {
                code: 'isf_identity_conflict',
                message: 'ISF ID identity is already linked',
                requestId: req.requestId,
              },
            });
          }
          throw err;
        }
      },
    );

    app.post(
      '/auth/isf/link',
      { preHandler: requireAuth(), config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
      async (req, reply) => {
        const parsed = IsfSessionBody.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }

        let assertion: VerifiedIsfIdAssertion;
        try {
          assertion = await verifyIsfIdAssertion(parsed.data.token);
        } catch (err) {
          return sendAssertionError(reply, req.requestId, err);
        }

        const current = await prisma.user.findUnique({ where: { id: req.user!.id } });
        if (!current) {
          return reply.code(401).send({
            error: {
              code: 'unauthorized',
              message: 'Authentication required',
              requestId: req.requestId,
            },
          });
        }
        if (current.email.toLowerCase() !== assertion.email) {
          return reply.code(409).send({
            error: {
              code: 'isf_email_mismatch',
              message: 'ISF ID email must match the signed-in local account',
              requestId: req.requestId,
            },
          });
        }

        try {
          await prisma.$transaction(async (tx) => {
            const existing = await tx.user.findUnique({
              where: { isfSubjectId: assertion.subjectId },
            });
            if (existing && existing.id !== current.id) throw new IsfIdentityLinkRequiredError();

            await consumeAssertion(assertion, req, current.id, tx);
            await tx.user.update({
              where: { id: current.id },
              data: { isfSubjectId: assertion.subjectId },
            });
            await audit.record(
              {
                ...audit.fromRequest(req),
                actorUserId: current.id,
                action: 'auth.isf.identity_linked',
                result: 'success',
                scopeFederationId: null,
                scopeCompetitionId: null,
                targetType: 'user',
                targetId: current.id,
                before: { isfSubjectId: current.isfSubjectId },
                after: { isfSubjectId: assertion.subjectId },
              },
              tx,
            );
          });
        } catch (err) {
          if (err instanceof IsfAssertionReusedError) {
            return reply.code(409).send({
              error: {
                code: 'isf_assertion_reused',
                message: err.message,
                requestId: req.requestId,
              },
            });
          }
          if (err instanceof IsfIdentityLinkRequiredError) {
            return reply.code(409).send({
              error: {
                code: 'isf_identity_conflict',
                message: 'ISF ID identity is linked to another user',
                requestId: req.requestId,
              },
            });
          }
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return reply.code(409).send({
              error: {
                code: 'isf_identity_conflict',
                message: 'ISF ID identity is already linked',
                requestId: req.requestId,
              },
            });
          }
          throw err;
        }

        return reply.send({ status: 'linked', isfSubjectId: assertion.subjectId });
      },
    );
  },
};
