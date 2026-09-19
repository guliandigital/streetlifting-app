import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { prisma } from './db.js';
import type { IsfIdIssuer } from './issuer.js';
import { browserLoginCsp, renderBrowserLoginPage } from './browser-login.js';
import { findRelyingParty, type IsfIdRelyingParty } from './relying-parties.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTHORIZATION_CODE_TTL_MS = 90 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const START_RATE_LIMIT = { max: 3, windowMs: 60_000 };
const VERIFY_RATE_LIMIT = { max: 5, windowMs: 60_000 };
const SESSION_COOKIE = '__Host-isf_id_session';

const StartBody = z
  .object({
    email: z.string().email().max(254),
    displayName: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
const VerifyBody = z
  .object({
    email: z.string().email().max(254),
    code: z.string().regex(/^\d{6}$/),
    displayName: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
const LaunchBody = z.object({ audience: z.string().trim().min(1).max(255) }).strict();
const AuthorizeQuery = z
  .object({
    response_type: z.literal('code'),
    client_id: z.string().trim().min(1).max(255),
    redirect_uri: z.string().trim().url().max(2048),
    state: z
      .string()
      .regex(/^[A-Za-z0-9._~-]{8,512}$/)
      .optional(),
    code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
    code_challenge_method: z.literal('S256'),
  })
  .strict();
const TokenBody = z
  .object({
    grant_type: z.literal('authorization_code'),
    client_id: z.string().trim().min(1).max(255),
    redirect_uri: z.string().trim().url().max(2048),
    code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
  })
  .strict();

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function requiredSecret(name: string): string {
  const value = process.env[name]?.trim() ?? '';
  if (value.length < 32) throw new Error(`${name} must be at least 32 characters`);
  return value;
}

function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function challengeHash(email: string, code: string): string {
  return hmac(requiredSecret('ISF_ID_CHALLENGE_SECRET'), `${email}\0${code}`);
}

function sessionHash(token: string): string {
  return hmac(requiredSecret('ISF_ID_SESSION_SECRET'), token);
}

function authorizationCodeHash(code: string): string {
  return hmac(requiredSecret('ISF_ID_AUTHORIZATION_CODE_SECRET'), code);
}

function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function tokenFromRequest(req: Pick<FastifyRequest, 'headers'>): string | null {
  const value = req.headers.authorization;
  if (value?.startsWith('Bearer ')) return value.slice('Bearer '.length).trim() || null;
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  for (const pair of cookie.split(';')) {
    const [name, ...parts] = pair.trim().split('=');
    if (name !== SESSION_COOKIE) continue;
    const token = parts.join('=').trim();
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  }
  return null;
}

export function createRateGuard() {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (key: string, rule: { max: number; windowMs: number }): boolean => {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
      return true;
    }
    if (bucket.count >= rule.max) return false;
    bucket.count += 1;
    return true;
  };
}

async function currentSession(req: FastifyRequest) {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const session = await prisma.identitySession.findUnique({
    where: { tokenHash: sessionHash(token) },
    include: { account: true },
  });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    session.account.status !== 'active'
  )
    return null;
  return session;
}

export async function currentAccount(req: FastifyRequest) {
  return (await currentSession(req))?.account ?? null;
}

function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.header(
    'set-cookie',
    `${SESSION_COOKIE}=${token}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; Path=/; HttpOnly; Secure; SameSite=Lax`,
  );
}

function clearSessionCookie(reply: FastifyReply): void {
  reply.header(
    'set-cookie',
    `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`,
  );
}

async function requireAccount(req: FastifyRequest, reply: FastifyReply) {
  const account = await currentAccount(req);
  if (!account) {
    await reply
      .code(401)
      .send({ error: { code: 'unauthorized', message: 'Authentication required' } });
    return null;
  }
  return account;
}

async function sendCode(email: string, code: string): Promise<void> {
  const endpoint = process.env.ISF_ID_MAILER_ENDPOINT?.trim();
  const message = {
    from: process.env.ISF_ID_MAILER_FROM ?? 'ISF ID <no-reply@streetlifting.app>',
    to: email,
    subject: 'ISF ID login code',
    text: `Your ISF ID login code is ${code}. It expires in 10 minutes.`,
  };
  if (endpoint) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.ISF_ID_MAILER_TOKEN
            ? { authorization: `Bearer ${process.env.ISF_ID_MAILER_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`ISF ID mailer returned ${response.status}`);
      return;
    } finally {
      clearTimeout(timeout);
    }
  }

  const host = process.env.ISF_ID_SMTP_HOST?.trim();
  const user = process.env.ISF_ID_SMTP_USER?.trim();
  const pass = process.env.ISF_ID_SMTP_PASSWORD;
  if (!host || !user || !pass) throw new Error('ISF ID mail delivery is not configured');

  const secure = ['1', 'true', 'yes', 'on'].includes(
    (process.env.ISF_ID_SMTP_SECURE ?? '').trim().toLowerCase(),
  );
  const port = Number(process.env.ISF_ID_SMTP_PORT ?? (secure ? 465 : 587));
  const transporter = nodemailer.createTransport({
    // Do not replace the hostname with an IP address: SMTP TLS certificates
    // are issued for the configured hostname.
    host,
    port: Number.isFinite(port) && port > 0 ? port : secure ? 465 : 587,
    secure,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });
  await transporter.sendMail(message);
}

function oauthParty(
  relyingParties: readonly IsfIdRelyingParty[],
  input: z.infer<typeof AuthorizeQuery> | z.infer<typeof TokenBody>,
): IsfIdRelyingParty | null {
  return findRelyingParty(relyingParties, input.client_id, input.redirect_uri);
}

function oauthAuthorizePath(input: z.infer<typeof AuthorizeQuery>): string {
  const query = new URLSearchParams({
    response_type: input.response_type,
    client_id: input.client_id,
    redirect_uri: input.redirect_uri,
    ...(input.state ? { state: input.state } : {}),
    code_challenge: input.code_challenge,
    code_challenge_method: input.code_challenge_method,
  });
  return `/oauth/authorize?${query.toString()}`;
}

async function createAuthorizationCode(
  accountId: string,
  request: z.infer<typeof AuthorizeQuery>,
): Promise<string> {
  const code = randomBytes(32).toString('base64url');
  await prisma.identityAuthorizationCode.create({
    data: {
      accountId,
      codeHash: authorizationCodeHash(code),
      clientId: request.client_id,
      redirectUri: request.redirect_uri,
      codeChallenge: request.code_challenge,
      expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
    },
  });
  return code;
}

function oauthRedirect(request: z.infer<typeof AuthorizeQuery>, code: string): string {
  const destination = new URL(request.redirect_uri);
  destination.searchParams.set('code', code);
  if (request.state) destination.searchParams.set('state', request.state);
  return destination.toString();
}

function sendBrowserLoginPage(
  reply: FastifyReply,
  party: IsfIdRelyingParty,
  authorizationUrl: string,
) {
  const nonce = randomBytes(16).toString('base64');
  reply
    .header('cache-control', 'no-store')
    .header('referrer-policy', 'no-referrer')
    .header('x-content-type-options', 'nosniff')
    .header('content-security-policy', browserLoginCsp(nonce))
    .type('text/html; charset=utf-8');
  return reply.send(renderBrowserLoginPage(party, nonce, authorizationUrl));
}

export function registerIsfIdAuthentication(
  app: FastifyInstance,
  issuer: IsfIdIssuer,
  relyingParties: readonly IsfIdRelyingParty[],
): void {
  const allowRequest = createRateGuard();
  app.post('/auth/email/start', async (req, reply) => {
    const parsed = StartBody.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { code: 'validation_error', message: parsed.error.message } });
    const email = normalizedEmail(parsed.data.email);
    if (!allowRequest(`start:${req.ip}:${email}`, START_RATE_LIMIT)) {
      return reply.code(429).send({ error: { code: 'rate_limited', message: 'Try again later' } });
    }
    const code = String(randomInt(100_000, 1_000_000));
    try {
      await prisma.loginChallenge.create({
        data: {
          emailNormalized: email,
          codeHash: challengeHash(email, code),
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        },
      });
      await sendCode(email, code);
    } catch (err) {
      req.log.error(
        { err: err instanceof Error ? err.name : 'unknown' },
        'ISF ID login code delivery failed',
      );
      return reply.code(503).send({
        error: { code: 'login_delivery_unavailable', message: 'Login delivery is unavailable' },
      });
    }
    return reply.code(202).send({ status: 'sent' });
  });

  app.post('/auth/email/verify', async (req, reply) => {
    const parsed = VerifyBody.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { code: 'validation_error', message: parsed.error.message } });
    const email = normalizedEmail(parsed.data.email);
    if (!allowRequest(`verify:${req.ip}:${email}`, VERIFY_RATE_LIMIT)) {
      return reply.code(429).send({ error: { code: 'rate_limited', message: 'Try again later' } });
    }
    const now = new Date();
    const challenge = await prisma.loginChallenge.findFirst({
      where: { emailNormalized: email, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    const expected = challenge ? Buffer.from(challenge.codeHash, 'hex') : null;
    const actual = Buffer.from(challengeHash(email, parsed.data.code), 'hex');
    const valid = Boolean(
      expected && expected.length === actual.length && timingSafeEqual(expected, actual),
    );
    if (!challenge || !valid || challenge.attemptCount >= MAX_OTP_ATTEMPTS) {
      if (challenge)
        await prisma.loginChallenge.update({
          where: { id: challenge.id },
          data: {
            attemptCount: { increment: 1 },
            ...(challenge.attemptCount + 1 >= MAX_OTP_ATTEMPTS ? { consumedAt: now } : {}),
          },
        });
      return reply.code(401).send({
        error: { code: 'invalid_login_code', message: 'Invalid or expired login code' },
      });
    }

    const opaque = randomBytes(32).toString('base64url');
    const account = await prisma.$transaction(async (tx) => {
      await tx.loginChallenge.update({ where: { id: challenge.id }, data: { consumedAt: now } });
      const existing = await tx.identityAccount.findUnique({ where: { emailNormalized: email } });
      const identity =
        existing ??
        (await tx.identityAccount.create({
          data: {
            email,
            emailNormalized: email,
            displayName:
              parsed.data.displayName ?? (email.slice(0, email.indexOf('@')) || 'ISF User'),
            emailVerifiedAt: now,
          },
        }));
      if (existing && !existing.emailVerifiedAt)
        await tx.identityAccount.update({
          where: { id: existing.id },
          data: { emailVerifiedAt: now },
        });
      await tx.identitySession.updateMany({
        where: { accountId: identity.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.identitySession.create({
        data: {
          accountId: identity.id,
          tokenHash: sessionHash(opaque),
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
      });
      return identity;
    });
    setSessionCookie(reply, opaque);
    return reply.send({
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      account: { id: account.id, email: account.email, displayName: account.displayName },
    });
  });

  app.post('/auth/session/logout', async (req, reply) => {
    const session = await currentSession(req);
    if (session)
      await prisma.identitySession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get('/auth/me', async (req, reply) => {
    const account = await requireAccount(req, reply);
    if (!account) return;
    return {
      account: {
        id: account.id,
        email: account.email,
        displayName: account.displayName,
        emailVerifiedAt: account.emailVerifiedAt?.toISOString() ?? null,
      },
    };
  });

  app.get('/oauth/authorize', async (req, reply) => {
    const parsed = AuthorizeQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).type('text/plain; charset=utf-8').send('Unknown ISF ID OAuth client.');
    }
    const request = parsed.data;
    const party = oauthParty(relyingParties, request);
    if (!party)
      return reply.code(400).type('text/plain; charset=utf-8').send('Unknown ISF ID OAuth client.');

    const account = await currentAccount(req);
    if (!account) {
      return sendBrowserLoginPage(reply, party, oauthAuthorizePath(request));
    }

    const code = await createAuthorizationCode(account.id, request);
    return reply.redirect(oauthRedirect(request, code), 302);
  });

  app.post('/oauth/token', async (req, reply) => {
    const parsed = TokenBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'invalid_client', message: 'Unknown client' } });
    }
    const request = parsed.data;
    const party = oauthParty(relyingParties, request);
    if (!party)
      return reply.code(400).send({ error: { code: 'invalid_client', message: 'Unknown client' } });

    const now = new Date();
    const code = await prisma.identityAuthorizationCode.findUnique({
      where: { codeHash: authorizationCodeHash(request.code) },
      include: { account: true },
    });
    if (
      !code ||
      code.usedAt ||
      code.expiresAt <= now ||
      code.clientId !== request.client_id ||
      code.redirectUri !== request.redirect_uri ||
      code.codeChallenge !== codeChallenge(request.code_verifier)
    ) {
      return reply
        .code(400)
        .send({ error: { code: 'invalid_grant', message: 'Invalid code grant' } });
    }

    const consumed = await prisma.identityAuthorizationCode.updateMany({
      where: { id: code.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) {
      return reply
        .code(400)
        .send({ error: { code: 'invalid_grant', message: 'Code already used' } });
    }

    const token = await issuer.issueLaunchAssertion({
      subjectId: code.account.id,
      email: code.account.email,
      displayName: code.account.displayName,
      audience: 'streetlifting-api',
    });
    return reply.send({
      access_token: token,
      token_type: 'Bearer',
      expires_in: issuer.assertionTtlSeconds,
      account: {
        id: code.account.id,
        email: code.account.email,
        displayName: code.account.displayName,
      },
    });
  });

  app.post('/sso/launch', async (req, reply) => {
    const account = await requireAccount(req, reply);
    if (!account) return;
    const parsed = LaunchBody.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: { code: 'validation_error', message: parsed.error.message } });
    try {
      return {
        token: await issuer.issueLaunchAssertion({
          subjectId: account.id,
          email: account.email,
          displayName: account.displayName,
          audience: parsed.data.audience,
        }),
      };
    } catch {
      return reply
        .code(400)
        .send({ error: { code: 'launch_rejected', message: 'Unknown relying-party audience' } });
    }
  });
}
