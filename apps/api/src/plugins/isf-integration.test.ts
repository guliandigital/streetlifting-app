import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerRequestContext } from '../lib/request-context.js';
import { hashServiceToken } from '../lib/service-auth.js';
import { isfIntegrationPlugin } from './isf-integration.js';

const prismaMock = vi.hoisted(() => ({
  apiServiceClient: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  competition: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  record: {
    findMany: vi.fn(),
  },
}));

const auditMock = vi.hoisted(() => ({
  record: vi.fn(),
  withAudit: vi.fn(async (_entry: unknown, work: (tx: unknown) => Promise<unknown>) =>
    work(prismaMock),
  ),
  fromRequest: vi.fn(
    (req: { ip?: string; requestId: string; headers: Record<string, unknown> }) => ({
      actorUserId: null,
      actorIp: req.ip ?? null,
      actorUserAgent:
        typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      requestId: req.requestId,
    }),
  ),
}));

vi.mock('../lib/db.js', async () => {
  const { Prisma } = await vi.importActual('@prisma/client');
  return { prisma: prismaMock, Prisma };
});

vi.mock('../lib/audit.js', () => auditMock);

const readToken = 'slisf_valid_read_token';
const readClient = {
  id: '00000000-0000-0000-0000-000000000101',
  code: 'isf-web',
  name: 'ISF Web',
  tokenHash: hashServiceToken(readToken),
  scopes: ['isf:read'],
  isActive: true,
  rateLimitRpm: 100,
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
  revokedAt: null,
};

const webhookToken = 'slisf_valid_webhook_token';
const webhookOnlyClient = {
  ...readClient,
  id: '00000000-0000-0000-0000-000000000102',
  code: 'isf-webhook',
  tokenHash: hashServiceToken(webhookToken),
  scopes: ['isf:webhook'],
};

const competitionRows = [
  {
    id: '00000000-0000-0000-0000-000000000201',
    federationId: '00000000-0000-0000-0000-000000000301',
    code: 'RU-2026-001',
    nameRu: 'Кубок',
    nameEn: 'Cup',
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-06-01T00:00:00.000Z'),
    city: 'Moscow',
    venue: 'Venue',
    timezone: 'Europe/Moscow',
    status: 'finalized',
    updatedAt: new Date('2026-05-20T00:00:00.000Z'),
    federation: {
      id: '00000000-0000-0000-0000-000000000301',
      code: 'RU',
      isfTenantCode: 'ru',
      countryCode: 'RU',
      isPublicResultsClosed: false,
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000202',
    federationId: '00000000-0000-0000-0000-000000000301',
    code: 'RU-2026-002',
    nameRu: 'Финал',
    nameEn: 'Final',
    startDate: new Date('2026-07-01T00:00:00.000Z'),
    endDate: new Date('2026-07-01T00:00:00.000Z'),
    city: 'Moscow',
    venue: 'Venue',
    timezone: 'Europe/Moscow',
    status: 'finalized',
    updatedAt: new Date('2026-05-21T00:00:00.000Z'),
    federation: {
      id: '00000000-0000-0000-0000-000000000301',
      code: 'RU',
      isfTenantCode: 'ru',
      countryCode: 'RU',
      isPublicResultsClosed: false,
    },
  },
];

async function buildApp() {
  const app = Fastify({ logger: false });
  await registerRequestContext(app);
  await app.register(isfIntegrationPlugin.register);
  return app;
}

describe('ISF integration routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.apiServiceClient.findFirst.mockImplementation(
      ({ where }: { where: { tokenHash: string } }) => {
        if (where.tokenHash === readClient.tokenHash) return Promise.resolve(readClient);
        if (where.tokenHash === webhookOnlyClient.tokenHash)
          return Promise.resolve(webhookOnlyClient);
        return Promise.resolve(null);
      },
    );
    prismaMock.competition.findMany.mockResolvedValue([]);
    prismaMock.record.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects service routes without a bearer token', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/isf/v1/meta' });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('unauthorized');
    await app.close();
  });

  it('keeps federation protocol-key administration behind platform authentication', async () => {
    const app = await buildApp();
    const list = await app.inject({ method: 'GET', url: '/integrations/isf/protocol-keys' });
    const revoke = await app.inject({
      method: 'POST',
      url: '/integrations/isf/protocol-keys/00000000-0000-4000-8000-000000000001/revoke',
    });

    expect(list.statusCode).toBe(401);
    expect(revoke.statusCode).toBe(401);
    await app.close();
  });

  it('rejects browser-origin service requests even with a valid token', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/isf/v1/meta',
      headers: { authorization: `Bearer ${readToken}`, origin: 'https://streetlifting.app' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('browser_cors_forbidden');
    expect(prismaMock.apiServiceClient.findFirst).not.toHaveBeenCalled();
    await app.close();
  });

  it('enforces service-token scopes', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/isf/v1/meta',
      headers: { authorization: `Bearer ${webhookToken}` },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('insufficient_scope');
    await app.close();
  });

  it('applies tenant filter and cursor pagination to competitions', async () => {
    const app = await buildApp();
    prismaMock.competition.findMany.mockResolvedValueOnce(competitionRows);

    const response = await app.inject({
      method: 'GET',
      url: '/isf/v1/competitions?tenant=ru&changedSince=2026-05-01T00:00:00.000Z&limit=1',
      headers: { authorization: `Bearer ${readToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.nextCursor).toEqual(expect.any(String));
    expect(body.items[0].tenant).toBe('ru');
    expect(JSON.stringify(prismaMock.competition.findMany.mock.calls[0]?.[0].where)).toContain(
      '"isfTenantCode":"ru"',
    );

    prismaMock.competition.findMany.mockResolvedValueOnce([competitionRows[1]!]);
    const next = await app.inject({
      method: 'GET',
      url: `/isf/v1/competitions?tenant=ru&cursor=${body.nextCursor}&limit=1`,
      headers: { authorization: `Bearer ${readToken}` },
    });

    expect(next.statusCode).toBe(200);
    expect(JSON.stringify(prismaMock.competition.findMany.mock.calls[1]?.[0].where)).toContain(
      competitionRows[0]!.id,
    );
    await app.close();
  });

  it('keeps checksums stable across repeated exports of unchanged data', async () => {
    const app = await buildApp();
    prismaMock.competition.findMany.mockResolvedValue([competitionRows[0]!]);

    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-05-20T00:00:00.000Z'));
    const first = await app.inject({
      method: 'GET',
      url: '/isf/v1/competitions?tenant=ru',
      headers: { authorization: `Bearer ${readToken}` },
    });
    vi.setSystemTime(new Date('2026-05-20T01:00:00.000Z'));
    const second = await app.inject({
      method: 'GET',
      url: '/isf/v1/competitions?tenant=ru',
      headers: { authorization: `Bearer ${readToken}` },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().items[0].provenance.exportedAt).not.toBe(
      second.json().items[0].provenance.exportedAt,
    );
    expect(first.json().checksum).toBe(second.json().checksum);
    await app.close();
  });
});
