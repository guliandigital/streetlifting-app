import Fastify, { type FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerRequestContext } from '../lib/request-context.js';
import { federationsPlugin } from './federations.js';

const prismaMock = vi.hoisted(() => ({
  federation: { findUnique: vi.fn(), update: vi.fn() },
}));

const auditMock = vi.hoisted(() => ({
  fromRequest: vi.fn(() => ({ actorIp: null, actorUserAgent: null, requestId: 'test-request' })),
  withAudit: vi.fn(async (_entry: unknown, work: (tx: typeof prismaMock) => Promise<unknown>) =>
    work(prismaMock),
  ),
}));

vi.mock('../lib/db.js', () => ({
  prisma: prismaMock,
  Prisma: { PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {} },
}));
vi.mock('../lib/audit.js', () => auditMock);

const federationId = '00000000-0000-0000-0000-000000000002';
type TestUser = NonNullable<FastifyRequest['user']>;

const platformAdmin: TestUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'admin@example.test',
  displayName: 'Admin',
  roles: [{ role: 'platform_admin' as const, federationId: null, competitionId: null }],
};

async function buildApp(user: TestUser = platformAdmin) {
  const app = Fastify({ logger: false });
  await registerRequestContext(app);
  app.addHook('preHandler', async (req) => {
    req.user = user;
  });
  await app.register(federationsPlugin.register);
  return app;
}

describe('federation affiliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.federation.findUnique.mockResolvedValue({
      id: federationId,
      affiliationStatus: 'unverified',
      affiliationBody: null,
      affiliationConfirmedAt: null,
    });
    prismaMock.federation.update.mockImplementation(async ({ data }) => ({
      id: federationId,
      ...data,
    }));
  });

  it('allows only a platform admin to confirm a national ISF/EUSF federation', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/federations/${federationId}/affiliation`,
      payload: { affiliationStatus: 'national_member', affiliationBody: 'isf' },
    });

    expect(response.statusCode).toBe(200);
    expect(prismaMock.federation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          affiliationStatus: 'national_member',
          affiliationBody: 'isf',
          affiliationConfirmedAt: expect.any(Date),
        }),
      }),
    );
    expect(auditMock.withAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'federation.affiliation.updated' }),
      expect.any(Function),
    );
    await app.close();
  });

  it('requires an ISF or EUSF body when confirming national membership', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'PATCH',
      url: `/federations/${federationId}/affiliation`,
      payload: { affiliationStatus: 'national_member' },
    });

    expect(response.statusCode).toBe(400);
    expect(prismaMock.federation.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('prevents federation administrators from self-confirming membership', async () => {
    const app = await buildApp({
      ...platformAdmin,
      roles: [{ role: 'federation_admin', federationId, competitionId: null }],
    });
    const response = await app.inject({
      method: 'PATCH',
      url: `/federations/${federationId}/affiliation`,
      payload: { affiliationStatus: 'national_member', affiliationBody: 'isf' },
    });

    expect(response.statusCode).toBe(403);
    expect(prismaMock.federation.update).not.toHaveBeenCalled();
    await app.close();
  });
});
