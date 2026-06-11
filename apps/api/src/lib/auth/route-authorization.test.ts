import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@streetlifting/domain';
import type { AuthenticatedUser } from './middleware.js';
import { registerRequestContext } from '../request-context.js';
import { competitionsPlugin } from '../../plugins/competitions.js';
import { competitionOpsPlugin } from '../../plugins/competition-ops.js';
import { federationsPlugin } from '../../plugins/federations.js';

const prismaMock = vi.hoisted(() => ({
  federation: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  competition: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  division: {
    findMany: vi.fn(),
  },
  platform: {
    findMany: vi.fn(),
  },
  judgeAssignment: {
    findMany: vi.fn(),
  },
  nomination: {
    findMany: vi.fn(),
  },
}));

vi.mock('../db.js', async () => {
  const { Prisma } = await vi.importActual('@prisma/client');
  return { prisma: prismaMock, Prisma };
});

const federationA = '00000000-0000-4000-8000-0000000000a1';
const federationB = '00000000-0000-4000-8000-0000000000b1';
const competitionA = '00000000-0000-4000-8000-000000000101';

const opsCompetition = {
  id: competitionA,
  federationId: federationA,
  code: 'TEST-2026',
  nameRu: 'Test competition',
  nameEn: 'Test competition',
  startDate: new Date('2026-06-01T00:00:00.000Z'),
  endDate: new Date('2026-06-01T00:00:00.000Z'),
  entryFeeKopecks: 1000n,
  federation: {
    id: federationA,
    code: 'TEST',
    nameRu: 'Test federation',
    billingTariffKopecksPerNomination: 100n,
    isPublicResultsClosed: false,
  },
};

type TestRole = AuthenticatedUser['roles'][number]['role'];

function authHeaders(
  role: Role,
  scope: { federationId?: string | null; competitionId?: string | null } = {},
): Record<string, string> {
  return {
    'x-test-role': role,
    ...(scope.federationId ? { 'x-test-federation-id': scope.federationId } : {}),
    ...(scope.competitionId ? { 'x-test-competition-id': scope.competitionId } : {}),
  };
}

function userFromHeaders(headers: Record<string, unknown>): AuthenticatedUser | null {
  const role = headers['x-test-role'];
  if (typeof role !== 'string') return null;

  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'route-auth-test@example.test',
    displayName: 'Route Auth Test',
    roles: [
      {
        role: role as TestRole,
        federationId:
          typeof headers['x-test-federation-id'] === 'string'
            ? headers['x-test-federation-id']
            : null,
        competitionId:
          typeof headers['x-test-competition-id'] === 'string'
            ? headers['x-test-competition-id']
            : null,
      },
    ],
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await registerRequestContext(app);
  app.addHook('preHandler', async (req) => {
    req.user = userFromHeaders(req.headers);
  });
  await app.register(federationsPlugin.register);
  await app.register(competitionsPlugin.register);
  await app.register(competitionOpsPlugin.register);
  return app;
}

async function withApp(work: (app: FastifyInstance) => Promise<void>): Promise<void> {
  const app = await buildApp();
  try {
    await work(app);
  } finally {
    await app.close();
  }
}

describe('API route authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.federation.findMany.mockResolvedValue([]);
    prismaMock.federation.findUnique.mockResolvedValue({ id: federationA, code: 'TEST' });
    prismaMock.competition.findMany.mockResolvedValue([]);
    prismaMock.competition.count.mockResolvedValue(0);
    prismaMock.competition.findUnique.mockResolvedValue(opsCompetition);
    prismaMock.division.findMany.mockResolvedValue([]);
    prismaMock.platform.findMany.mockResolvedValue([]);
    prismaMock.judgeAssignment.findMany.mockResolvedValue([]);
    prismaMock.nomination.findMany.mockResolvedValue([]);
  });

  it('returns 401 before DB reads when auth is missing on protected routes', async () => {
    await withApp(async (app) => {
      const response = await app.inject({ method: 'GET', url: '/competitions' });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('unauthorized');
      expect(prismaMock.competition.findMany).not.toHaveBeenCalled();
    });
  });

  it('denies federation reads outside caller scope before loading the federation', async () => {
    await withApp(async (app) => {
      const response = await app.inject({
        method: 'GET',
        url: `/federations/${federationB}`,
        headers: authHeaders('viewer', { federationId: federationA }),
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toMatchObject({ code: 'forbidden', message: 'Out of scope' });
      expect(prismaMock.federation.findUnique).not.toHaveBeenCalled();
    });
  });

  it('denies competition list federation filters outside caller scope before querying rows', async () => {
    await withApp(async (app) => {
      const response = await app.inject({
        method: 'GET',
        url: `/competitions?federationId=${federationB}`,
        headers: authHeaders('viewer', { federationId: federationA }),
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toMatchObject({ code: 'forbidden', message: 'Out of scope' });
      expect(prismaMock.competition.findMany).not.toHaveBeenCalled();
      expect(prismaMock.competition.count).not.toHaveBeenCalled();
    });
  });

  it('denies full ops to judge while allowing live ops for the same competition scope', async () => {
    await withApp(async (app) => {
      const headers = authHeaders('judge', { competitionId: competitionA });

      const fullOps = await app.inject({
        method: 'GET',
        url: `/competitions/${competitionA}/ops`,
        headers,
      });
      const liveOps = await app.inject({
        method: 'GET',
        url: `/competitions/${competitionA}/live-ops`,
        headers,
      });

      expect(fullOps.statusCode).toBe(403);
      expect(fullOps.json().error).toMatchObject({ code: 'forbidden', message: 'Out of scope' });
      expect(liveOps.statusCode).toBe(200);
      expect(liveOps.json().competition.id).toBe(competitionA);
    });
  });

  it('keeps report exports split between live protocol access and accounting access', async () => {
    await withApp(async (app) => {
      const accountantProtocol = await app.inject({
        method: 'GET',
        url: `/competitions/${competitionA}/protocol.csv`,
        headers: authHeaders('accountant', { federationId: federationA }),
      });
      const judgeAccounting = await app.inject({
        method: 'GET',
        url: `/competitions/${competitionA}/accounting.csv`,
        headers: authHeaders('judge', { competitionId: competitionA }),
      });

      expect(accountantProtocol.statusCode).toBe(403);
      expect(accountantProtocol.json().error).toMatchObject({
        code: 'forbidden',
        message: 'Out of scope',
      });
      expect(judgeAccounting.statusCode).toBe(403);
      expect(judgeAccounting.json().error).toMatchObject({
        code: 'forbidden',
        message: 'accounting role required',
      });
    });
  });

  it('denies public scoreboard when federation public results are closed', async () => {
    prismaMock.competition.findUnique.mockResolvedValueOnce({
      ...opsCompetition,
      federation: { ...opsCompetition.federation, isPublicResultsClosed: true },
    });

    await withApp(async (app) => {
      const response = await app.inject({
        method: 'GET',
        url: `/public/competitions/${competitionA}/scoreboard`,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toMatchObject({
        code: 'public_results_closed',
        message: 'Public results are closed',
      });
    });
  });
});
