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
import { readCabinetOverview } from './cabinet.js';

const IsfSessionBody = z
  .object({
    token: z.string().min(1).max(16_384),
  })
  .strict();
const federationPassportActionBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('profile.update'),
    displayName: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().min(3).max(40).nullable().optional(),
    telegramHandle: z.string().trim().min(2).max(64).nullable().optional(),
  }),
  z.object({
    action: z.literal('privacy.update'),
    privacyMode: z.enum(['public_results', 'hidden']),
  }),
  z.object({ action: z.literal('consent.revoke'), consentId: z.string().uuid() }),
  z.object({
    action: z.literal('request.submit'),
    federationId: z.string().uuid(),
    kind: z.enum(['official_profile', 'official_credential', 'sport_rank']),
    payload: z.record(z.unknown()),
    supportingAttachmentId: z.string().uuid().nullable().optional(),
  }),
  z.object({ action: z.literal('request.cancel'), requestId: z.string().uuid() }),
  z.object({
    action: z.literal('request.review'),
    requestId: z.string().uuid(),
    status: z.enum(['approved', 'rejected']),
    reviewNote: z.string().trim().max(1000).optional(),
    resolution: z.record(z.unknown()).optional(),
  }),
  z.object({
    action: z.literal('attachment.upload'),
    filename: z.string().trim().min(1).max(180),
    mimeType: z.string().trim().min(1).max(120),
    contentBase64: z
      .string()
      .min(1)
      .max(7 * 1024 * 1024),
    kind: z.enum(['certificate_pdf', 'misc']).default('misc'),
  }),
]);

type FederationPassportAction = z.infer<typeof federationPassportActionBody>;

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

function internalPassportAction(action: FederationPassportAction): {
  method: 'PATCH' | 'POST';
  url: string;
  payload: Record<string, unknown>;
} {
  switch (action.action) {
    case 'profile.update':
      return {
        method: 'PATCH',
        url: '/passport/profile',
        payload: {
          ...(action.displayName !== undefined ? { displayName: action.displayName } : {}),
          ...(action.phone !== undefined ? { phone: action.phone } : {}),
          ...(action.telegramHandle !== undefined ? { telegramHandle: action.telegramHandle } : {}),
        },
      };
    case 'privacy.update':
      return {
        method: 'PATCH',
        url: '/passport/privacy',
        payload: { privacyMode: action.privacyMode },
      };
    case 'consent.revoke':
      return { method: 'POST', url: `/passport/consents/${action.consentId}/revoke`, payload: {} };
    case 'request.submit':
      return {
        method: 'POST',
        url: '/passport/requests',
        payload: {
          federationId: action.federationId,
          kind: action.kind,
          payload: action.payload,
          ...(action.supportingAttachmentId !== undefined
            ? { supportingAttachmentId: action.supportingAttachmentId }
            : {}),
        },
      };
    case 'request.cancel':
      return { method: 'POST', url: `/passport/requests/${action.requestId}/cancel`, payload: {} };
    case 'request.review':
      return {
        method: 'POST',
        url: `/passport/requests/${action.requestId}/review`,
        payload: {
          status: action.status,
          ...(action.reviewNote !== undefined ? { reviewNote: action.reviewNote } : {}),
          ...(action.resolution !== undefined ? { resolution: action.resolution } : {}),
        },
      };
    case 'attachment.upload':
      return {
        method: 'POST',
        url: '/passport/attachments',
        payload: {
          filename: action.filename,
          mimeType: action.mimeType,
          contentBase64: action.contentBase64,
          kind: action.kind,
        },
      };
  }
  throw new Error('Unsupported federation passport action');
}

async function resolveIsfIdentity(assertion: VerifiedIsfIdAssertion, req: FastifyRequest) {
  return prisma.$transaction(async (tx) => {
    const linked = await tx.user.findUnique({ where: { isfSubjectId: assertion.subjectId } });
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
          const user = await resolveIsfIdentity(assertion, req);

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

    app.get(
      '/federation/passport/overview',
      { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
      async (req, reply) => {
        const authorization = req.headers.authorization;
        const token = authorization?.startsWith('Bearer ')
          ? authorization.slice('Bearer '.length).trim()
          : '';
        if (!token) {
          return reply.code(401).send({
            error: {
              code: 'unauthorized',
              message: 'Authentication required',
              requestId: req.requestId,
            },
          });
        }

        let assertion: VerifiedIsfIdAssertion;
        try {
          assertion = await verifyIsfIdAssertion(token);
        } catch (err) {
          return sendAssertionError(reply, req.requestId, err);
        }

        try {
          const user = await resolveIsfIdentity(assertion, req);
          return reply.send({
            overview: await readCabinetOverview(user),
            syncedAt: new Date().toISOString(),
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
          throw err;
        }
      },
    );

    app.post(
      '/federation/passport/action',
      { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, bodyLimit: 7 * 1024 * 1024 },
      async (req, reply) => {
        const parsed = federationPassportActionBody.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }
        const authorization = req.headers.authorization;
        const token = authorization?.startsWith('Bearer ')
          ? authorization.slice('Bearer '.length).trim()
          : '';
        if (!token) {
          return reply.code(401).send({
            error: {
              code: 'unauthorized',
              message: 'Authentication required',
              requestId: req.requestId,
            },
          });
        }

        let assertion: VerifiedIsfIdAssertion;
        try {
          assertion = await verifyIsfIdAssertion(token);
        } catch (err) {
          return sendAssertionError(reply, req.requestId, err);
        }

        try {
          const user = await resolveIsfIdentity(assertion, req);
          const action = internalPassportAction(parsed.data);
          const accessToken = await signAccessToken(user.id);
          const delegated = await app.inject({
            method: action.method,
            url: action.url,
            headers: {
              'authorization': `Bearer ${accessToken}`,
              'content-type': 'application/json',
              'user-agent': 'ISF Passport relying party',
            },
            payload: action.payload,
          });
          const body = delegated.json();
          if (delegated.statusCode >= 400) return reply.code(delegated.statusCode).send(body);
          return reply.code(delegated.statusCode).send({
            result: body,
            overview: await readCabinetOverview(user),
            syncedAt: new Date().toISOString(),
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
          throw err;
        }
      },
    );

    app.get<{ Params: { id: string } }>(
      '/federation/passport/attachments/:id/download',
      { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
      async (req, reply) => {
        if (!z.string().uuid().safeParse(req.params.id).success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: 'Invalid attachment id',
              requestId: req.requestId,
            },
          });
        }
        const authorization = req.headers.authorization;
        const token = authorization?.startsWith('Bearer ')
          ? authorization.slice('Bearer '.length).trim()
          : '';
        if (!token) {
          return reply.code(401).send({
            error: {
              code: 'unauthorized',
              message: 'Authentication required',
              requestId: req.requestId,
            },
          });
        }
        let assertion: VerifiedIsfIdAssertion;
        try {
          assertion = await verifyIsfIdAssertion(token);
        } catch (err) {
          return sendAssertionError(reply, req.requestId, err);
        }

        try {
          const user = await resolveIsfIdentity(assertion, req);
          const accessToken = await signAccessToken(user.id);
          const delegated = await app.inject({
            method: 'GET',
            url: `/passport/attachments/${req.params.id}/download`,
            headers: {
              'authorization': `Bearer ${accessToken}`,
              'user-agent': 'ISF Passport relying party',
            },
          });
          if (delegated.statusCode >= 400)
            return reply.code(delegated.statusCode).send(delegated.json());
          const contentType = delegated.headers['content-type'];
          const disposition = delegated.headers['content-disposition'];
          if (contentType) reply.header('Content-Type', contentType);
          if (disposition) reply.header('Content-Disposition', disposition);
          reply.header('Cache-Control', 'private, no-store');
          return reply.code(delegated.statusCode).send(delegated.rawPayload);
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
