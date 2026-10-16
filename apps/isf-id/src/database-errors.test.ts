import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../generated/prisma/index.js';
import { buildIsfIdApp } from './isf-id-app.js';

const mocks = vi.hoisted(() => ({
  sessionFind: vi.fn(),
  authorizationCreate: vi.fn(),
  issueAssertion: vi.fn(),
}));

vi.mock('./db.js', () => ({
  prisma: {
    identitySession: { findUnique: mocks.sessionFind },
    identityAuthorizationCode: { create: mocks.authorizationCreate },
  },
}));

const cookie = `__Host-isf_id_session=${'a'.repeat(43)}`;
const internalMessage =
  'Invalid prisma.identitySession.findUnique invocation: cannot reach private-db.example:5432';
const authorizeUrl = `/oauth/authorize?${new URLSearchParams({
  response_type: 'code',
  client_id: 'streetlifting-pro',
  redirect_uri: 'https://streetlifting.pro/passport/callback/',
  state: 'passport-state-123',
  code_challenge: 'a'.repeat(43),
  code_challenge_method: 'S256',
})}`;

function testApp() {
  return buildIsfIdApp(
    {
      assertionTtlSeconds: 120,
      jwks: () => ({ keys: [] }),
      issueLaunchAssertion: mocks.issueAssertion,
    },
    's'.repeat(48),
  );
}

function knownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(internalMessage, {
    code,
    clientVersion: '6.19.3',
  });
}

describe('ISF ID database outage responses', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('ISF_ID_SESSION_SECRET', 'test-session-secret-'.repeat(3));
    vi.stubEnv('ISF_ID_AUTHORIZATION_CODE_SECRET', 'test-code-secret-'.repeat(3));
    vi.stubEnv(
      'ISF_ID_RELYING_PARTIES',
      'streetlifting-pro=https://streetlifting.pro/passport/callback/',
    );
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(['P1001', 'P1002', 'P1017'])(
    'returns safe JSON 503 for a session lookup failure (%s)',
    async (code) => {
      mocks.sessionFind.mockRejectedValue(knownError(code));
      const app = testApp();
      try {
        const response = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
        expect(response.statusCode).toBe(503);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['retry-after']).toBe('30');
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(response.json()).toEqual({
          error: {
            code: 'identity_unavailable',
            message: 'Sign-in is temporarily unavailable. Please try again shortly.',
          },
        });
        expect(response.body).not.toContain('private-db');
        expect(response.body).not.toContain('prisma');
        expect(response.body).not.toContain(code);
        expect(mocks.issueAssertion).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    },
  );

  it.each(['P1001', 'P1002', 'P1017'])(
    'handles Prisma initialization reachability errors (%s)',
    async (code) => {
      mocks.sessionFind.mockRejectedValue(
        new Prisma.PrismaClientInitializationError(internalMessage, '6.19.3', code),
      );
      const app = testApp();
      try {
        const response = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
        expect(response.statusCode).toBe(503);
        expect(response.json().error.code).toBe('identity_unavailable');
        expect(response.body).not.toContain('private-db');
      } finally {
        await app.close();
      }
    },
  );

  it('preserves the browser session and resumes authorization after the database recovers', async () => {
    mocks.sessionFind.mockRejectedValueOnce(knownError('P1001')).mockResolvedValueOnce({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      account: {
        id: '00000000-0000-4000-8000-000000000001',
        status: 'active',
      },
    });
    mocks.authorizationCreate.mockResolvedValue({});
    const app = testApp();
    try {
      const unavailable = await app.inject({
        method: 'GET',
        url: authorizeUrl,
        headers: { cookie },
      });
      expect(unavailable.statusCode).toBe(503);
      expect(unavailable.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(unavailable.headers['cache-control']).toBe('no-store');
      expect(unavailable.headers['retry-after']).toBe('30');
      expect(unavailable.headers['set-cookie']).toBeUndefined();
      expect(unavailable.headers.location).toBeUndefined();
      expect(unavailable.body).toBe(
        'Sign-in is temporarily unavailable. Please try again shortly.',
      );
      expect(mocks.authorizationCreate).not.toHaveBeenCalled();
      expect(mocks.issueAssertion).not.toHaveBeenCalled();

      const recovered = await app.inject({ method: 'GET', url: authorizeUrl, headers: { cookie } });
      expect(recovered.statusCode).toBe(302);
      const redirect = new URL(String(recovered.headers.location));
      expect(redirect.origin + redirect.pathname).toBe(
        'https://streetlifting.pro/passport/callback/',
      );
      expect(redirect.searchParams.get('state')).toBe('passport-state-123');
      expect(redirect.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(mocks.authorizationCreate).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it('keeps signed-out login and rejected OAuth clients independent of session database errors', async () => {
    mocks.sessionFind.mockRejectedValue(knownError('P1001'));
    const app = testApp();
    try {
      const login = await app.inject({ method: 'GET', url: authorizeUrl });
      expect(login.statusCode).toBe(200);
      expect(login.headers['content-type']).toContain('text/html');
      const rejected = await app.inject({
        method: 'GET',
        url: authorizeUrl.replace('streetlifting-pro', 'unknown-client'),
        headers: { cookie },
      });
      expect(rejected.statusCode).toBe(400);
      expect(rejected.body).toBe('Unknown ISF ID OAuth client.');
      expect(mocks.sessionFind).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it.each([
    knownError('P2002'),
    new Prisma.PrismaClientInitializationError(internalMessage, '6.19.3', 'P1000'),
    new Prisma.PrismaClientInitializationError(internalMessage, '6.19.3'),
    new Error(internalMessage),
  ])('sanitizes unexpected errors without classifying them as an outage (%s)', async (error) => {
    mocks.sessionFind.mockRejectedValue(error);
    const app = testApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
      expect(response.statusCode).toBe(500);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['retry-after']).toBeUndefined();
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.json()).toEqual({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Internal Server Error',
      });
    } finally {
      await app.close();
    }
  });

  it('preserves Fastify client error status and response contract', async () => {
    const app = testApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/email/start',
        headers: { 'content-type': 'application/json' },
        payload: '{',
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        statusCode: 400,
        code: 'FST_ERR_CTP_INVALID_JSON_BODY',
        error: 'Bad Request',
      });
      expect(response.headers['retry-after']).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
