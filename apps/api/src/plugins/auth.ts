import type { FeaturePlugin } from '../lib/load-plugins.js';
import { z } from 'zod';
import { prisma, Prisma } from '../lib/db.js';
import { moduleLogger } from '../lib/logger.js';
import * as audit from '../lib/audit.js';
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '../lib/auth/password.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshFamily,
  signAccessToken,
} from '../lib/auth/tokens.js';
import { attachUser, requireAuth } from '../lib/auth/middleware.js';

const log = moduleLogger('auth');

const RegisterBody = z
  .object({
    email: z.string().email().max(254),
    displayName: z.string().min(1).max(120),
    password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  })
  .strict();

const LoginBody = z
  .object({
    email: z.string().email().max(254),
    password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  })
  .strict();

const RefreshBody = z
  .object({
    refreshToken: z.string().min(1).max(2048),
  })
  .strict();

const LogoutBody = z
  .object({
    refreshToken: z.string().min(1).max(2048),
  })
  .strict();

interface TokenPair {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

async function issueTokenPair(userId: string, ctx: { ip: string | null; userAgent: string | null }): Promise<TokenPair> {
  const accessToken = await signAccessToken(userId);
  const refresh = await issueRefreshToken(userId, ctx);
  return {
    accessToken,
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken: refresh.opaque,
    refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
  };
}

export const authPlugin: FeaturePlugin = {
  name: 'auth',
  register: async (app) => {
    // Attach user to every request in this plugin's scope; routes opt into
    // enforcement via requireAuth / requireRole.
    app.addHook('preHandler', attachUser);

    app.get('/health/auth', async () => ({ status: 'ok', module: 'auth' }));

    // ─── Register ──────────────────────────────────────────────────────
    // Rate limit per ADR-0004: account-creation is the most spammable endpoint.
    app.post(
      '/auth/register',
      { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } },
      async (req, reply) => {
      const parsed = RegisterBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
        });
      }
      const { email, displayName, password } = parsed.data;
      const passwordHash = await hashPassword(password);

      try {
        const user = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            action: 'auth.user.registered',
            scopeFederationId: null,
            scopeCompetitionId: null,
            targetType: 'user',
            targetId: '00000000-0000-0000-0000-000000000000',
            before: null,
            after: { email, displayName },
          },
          (tx) =>
            tx.user.create({
              data: { email, displayName, passwordHash },
              select: { id: true, email: true, displayName: true, createdAt: true },
            }),
        );
        // Patch the audit row's targetId — we didn't have it before the insert.
        // For now log it in the operational stream so we can correlate.
        log.info({ userId: user.id, requestId: req.requestId }, 'user registered');
        return reply.code(201).send({ user });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return reply.code(409).send({
            error: { code: 'email_taken', message: 'Email already registered', requestId: req.requestId },
          });
        }
        throw err;
      }
    },
    );

    // ─── Login ─────────────────────────────────────────────────────────
    // Strict rate limit: brute-force protection per ADR-0004.
    app.post(
      '/auth/login',
      { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
      async (req, reply) => {
      const parsed = LoginBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
        });
      }
      const { email, password } = parsed.data;
      const user = await prisma.user.findUnique({ where: { email } });
      const ok = user ? await verifyPassword(user.passwordHash ?? '', password) : false;

      const ctx = audit.fromRequest(req);
      if (!user || !ok) {
        await audit.record({
          ...ctx,
          action: 'auth.login.failed',
          result: 'denied',
          scopeFederationId: null,
          scopeCompetitionId: null,
          targetType: 'user',
          targetId: user?.id ?? '00000000-0000-0000-0000-000000000000',
          before: null,
          after: { email },
          notes: user ? 'wrong password' : 'user not found',
        });
        return reply.code(401).send({
          error: { code: 'invalid_credentials', message: 'Invalid email or password', requestId: req.requestId },
        });
      }

      // Lazy rehash if cost params have moved on since the original hash.
      if (user.passwordHash && needsRehash(user.passwordHash)) {
        const fresh = await hashPassword(password);
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash: fresh } });
      }

      const tokens = await issueTokenPair(user.id, { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null });
      await audit.record({
        ...ctx,
        actorUserId: user.id,
        action: 'auth.login.succeeded',
        result: 'success',
        scopeFederationId: null,
        scopeCompetitionId: null,
        targetType: 'user',
        targetId: user.id,
        before: null,
        after: null,
      });

      return reply.send({ user: { id: user.id, email: user.email, displayName: user.displayName }, ...tokens });
    },
    );

    // ─── Refresh ───────────────────────────────────────────────────────
    // Stricter than the global limit but allows healthy 1-2/min from the SPA.
    app.post(
      '/auth/refresh',
      { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
      async (req, reply) => {
      const parsed = RefreshBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
        });
      }
      const result = await rotateRefreshToken(parsed.data.refreshToken, {
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      });
      const ctx = audit.fromRequest(req);

      if ('error' in result) {
        const codeMap = { invalid: 'invalid_token', expired: 'token_expired', reuse: 'token_reuse' } as const;
        await audit.record({
          ...ctx,
          action: result.error === 'reuse' ? 'auth.refresh.reuse_detected' : 'auth.refresh.failed',
          result: result.error === 'reuse' ? 'denied' : 'failure',
          scopeFederationId: null,
          scopeCompetitionId: null,
          targetType: 'refresh_token',
          targetId: '00000000-0000-0000-0000-000000000000',
          before: null,
          after: null,
          notes: result.error,
        });
        return reply
          .code(401)
          .send({ error: { code: codeMap[result.error], message: 'Refresh failed', requestId: req.requestId } });
      }

      const accessToken = await signAccessToken(result.userId);
      await audit.record({
        ...ctx,
        actorUserId: result.userId,
        action: 'auth.refresh.succeeded',
        result: 'success',
        scopeFederationId: null,
        scopeCompetitionId: null,
        targetType: 'user',
        targetId: result.userId,
        before: null,
        after: null,
      });

      return reply.send({
        accessToken,
        accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
        refreshToken: result.issued.opaque,
        refreshTokenExpiresAt: result.issued.expiresAt.toISOString(),
      });
    },
    );

    // ─── Logout ────────────────────────────────────────────────────────
    app.post('/auth/logout', async (req, reply) => {
      const parsed = LogoutBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
        });
      }
      await revokeRefreshFamily(parsed.data.refreshToken);
      await audit.record({
        ...audit.fromRequest(req),
        actorUserId: req.user?.id ?? null,
        action: 'auth.logout',
        result: 'success',
        scopeFederationId: null,
        scopeCompetitionId: null,
        targetType: 'refresh_token',
        targetId: '00000000-0000-0000-0000-000000000000',
        before: null,
        after: null,
      });
      return reply.code(204).send();
    });

    // ─── Me ────────────────────────────────────────────────────────────
    app.get('/auth/me', { preHandler: requireAuth() }, async (req) => {
      const u = req.user!;
      return { user: { id: u.id, email: u.email, displayName: u.displayName, roles: u.roles } };
    });
  },
};
