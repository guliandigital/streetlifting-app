import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerIsfIdAuthentication } from './auth.js';
import type { IsfIdIssuer } from './issuer.js';

const mocks = vi.hoisted(() => ({
  challengeCreate: vi.fn(),
  challengeFind: vi.fn(),
  challengeUpdate: vi.fn(),
  accountFind: vi.fn(),
  accountCreate: vi.fn(),
  accountUpdate: vi.fn(),
  sessionsRevoke: vi.fn(),
  sessionCreate: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock('./db.js', () => ({
  prisma: {
    loginChallenge: {
      create: mocks.challengeCreate,
      findFirst: mocks.challengeFind,
      update: mocks.challengeUpdate,
    },
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        loginChallenge: { update: mocks.challengeUpdate },
        identityAccount: {
          findUnique: mocks.accountFind,
          create: mocks.accountCreate,
          update: mocks.accountUpdate,
        },
        identitySession: { updateMany: mocks.sessionsRevoke, create: mocks.sessionCreate },
      }),
  },
}));
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: mocks.sendMail }) },
}));

describe('existing email-only OTP account contract without database or mail delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ISF_ID_CHALLENGE_SECRET', 'test-challenge-secret-'.repeat(3));
    vi.stubEnv('ISF_ID_SESSION_SECRET', 'test-session-secret-'.repeat(3));
    vi.stubEnv('ISF_ID_MAILER_ENDPOINT', '');
    vi.stubEnv('ISF_ID_SMTP_HOST', 'smtp.example.test');
    vi.stubEnv('ISF_ID_SMTP_USER', 'test@example.test');
    vi.stubEnv('ISF_ID_SMTP_PASSWORD', 'not-a-real-password');
    mocks.sendMail.mockResolvedValue({ messageId: 'mock-only' });
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([false, true])(
    'creates after verification only, or reuses an existing normalized email (existing=%s)',
    async (existing) => {
      const account = {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'person@example.test',
        displayName: existing ? 'Existing Name' : 'person',
        emailVerifiedAt: new Date(),
        status: 'active',
      };
      let challenge: Record<string, unknown> | null = null;
      mocks.challengeCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        challenge = { ...data, id: 'challenge-1', attemptCount: 0, consumedAt: null };
        return Promise.resolve(challenge);
      });
      mocks.challengeFind.mockImplementation(() =>
        Promise.resolve(challenge?.consumedAt ? null : challenge),
      );
      mocks.challengeUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        Object.assign(challenge!, data);
        return Promise.resolve(challenge);
      });
      mocks.accountFind.mockResolvedValue(existing ? account : null);
      mocks.accountCreate.mockResolvedValue(account);
      mocks.sessionCreate.mockResolvedValue({ id: 'mock-session' });
      mocks.sessionsRevoke.mockResolvedValue({ count: 0 });
      const app = Fastify({ logger: false });
      registerIsfIdAuthentication(app, {} as IsfIdIssuer, []);
      try {
        const start = await app.inject({
          method: 'POST',
          url: '/auth/email/start',
          payload: { email: 'Person@example.test' },
        });
        expect(start.statusCode).toBe(202);
        expect(mocks.accountCreate).not.toHaveBeenCalled();
        const code = (mocks.sendMail.mock.calls[0]![0].text as string).match(/\b\d{6}\b/)?.[0];
        expect(code).toBeTruthy();
        const verify = await app.inject({
          method: 'POST',
          url: '/auth/email/verify',
          payload: { email: 'person@example.test', code },
        });
        expect(verify.statusCode).toBe(200);
        expect(verify.json().account).toEqual({
          id: account.id,
          email: account.email,
          displayName: account.displayName,
        });
        expect(mocks.accountFind).toHaveBeenCalledWith({
          where: { emailNormalized: 'person@example.test' },
        });
        expect(mocks.accountCreate).toHaveBeenCalledTimes(existing ? 0 : 1);
        if (!existing) {
          expect(mocks.accountCreate.mock.calls[0]![0].data).toMatchObject({
            email: 'person@example.test',
            emailNormalized: 'person@example.test',
            displayName: 'person',
            emailVerifiedAt: expect.any(Date),
          });
        }
        expect(verify.headers['set-cookie']).toContain('__Host-isf_id_session=');
        const repeated = await app.inject({
          method: 'POST',
          url: '/auth/email/verify',
          payload: { email: 'person@example.test', code },
        });
        expect(repeated.statusCode).toBe(401);
        expect(mocks.accountCreate).toHaveBeenCalledTimes(existing ? 0 : 1);
        expect(mocks.sessionCreate).toHaveBeenCalledTimes(1);
      } finally {
        await app.close();
      }
    },
  );
});
