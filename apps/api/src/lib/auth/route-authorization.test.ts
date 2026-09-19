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
  competitionTeamMember: { count: vi.fn() },
  consent: { findMany: vi.fn() },
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
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}));

it('requires finalization before archiving an active tournament', async () => {
  prismaMock.competition.findUnique.mockResolvedValue({ ...opsCompetition, status: 'in_progress' });
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/competitions/${competitionA}`,
      headers: authHeaders('platform_admin'),
      payload: { status: 'archived' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('competition_not_finalized');
  });
});
it('rejects finalization when finished statuses hide an incomplete protocol', async () => {
  prismaMock.competition.findUnique.mockResolvedValue({ ...opsCompetition, status: 'in_progress' });
  prismaMock.nomination.count.mockResolvedValue(0);
  prismaMock.nomination.findMany.mockResolvedValue([
    { discipline: { attemptCount: 3, components: [] }, attempts: [] },
  ]);
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/competitions/${competitionA}`,
      headers: authHeaders('platform_admin'),
      payload: { status: 'finalized' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('competition_protocol_incomplete');
  });
});

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
  it('does not grant federation accounting writes from a competition-only role', async () => {
    await withApp(async (app) => {
      const response = await app.inject({
        method: 'POST',
        url: `/federations/${federationA}/writeoffs`,
        headers: authHeaders('accountant', {
          federationId: federationA,
          competitionId: competitionA,
        }),
        payload: {},
      });
      expect(response.statusCode).toBe(403);
    });
  });
  it('denies ops and detail access to another tournament in the assigned federation', async () => {
    await withApp(async (app) => {
      const headers = authHeaders('secretary', {
        federationId: federationA,
        competitionId: '00000000-0000-4000-8000-000000000199',
      });
      for (const suffix of ['', '/ops', '/live-ops']) {
        expect(
          (await app.inject({ url: `/competitions/${competitionA}${suffix}`, headers })).statusCode,
        ).toBe(403);
      }
    });
  });
  it('intersects federation and competition filters in the list query', async () => {
    await withApp(async (app) => {
      const response = await app.inject({
        url: '/competitions',
        headers: authHeaders('secretary', {
          federationId: federationA,
          competitionId: competitionA,
        }),
      });
      expect(response.statusCode).toBe(200);
      expect(prismaMock.competition.findMany.mock.calls[0]![0].where.OR).toEqual([
        { federationId: federationA, id: competitionA },
      ]);
    });
  });
  it('requires a confirmed organizer before starting a competition', async () => {
    prismaMock.competition.findUnique.mockResolvedValue({ ...opsCompetition, status: 'draft' });
    prismaMock.competitionTeamMember.count.mockResolvedValue(0);
    await withApp(async (app) => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/competitions/${competitionA}`,
        headers: authHeaders('federation_admin', { federationId: federationA }),
        payload: { status: 'in_progress' },
      });
      expect(response.statusCode, response.body).toBe(409);
      expect(response.json().error.code).toBe('organizer_required');
      expect(prismaMock.competitionTeamMember.count).toHaveBeenCalledWith({
        where: { competitionId: competitionA, role: 'organizer', status: 'confirmed' },
      });
    });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.federation.findMany.mockResolvedValue([]);
    prismaMock.federation.findUnique.mockResolvedValue({ id: federationA, code: 'TEST' });
    prismaMock.competition.findMany.mockResolvedValue([]);
    prismaMock.competition.count.mockResolvedValue(0);
    prismaMock.competition.findUnique.mockResolvedValue(opsCompetition);
    prismaMock.division.findMany.mockResolvedValue([]);
    prismaMock.consent.findMany.mockResolvedValue([]);
    prismaMock.platform.findMany.mockResolvedValue([]);
    prismaMock.judgeAssignment.findMany.mockResolvedValue([]);
    prismaMock.nomination.findMany.mockResolvedValue([]);
    prismaMock.nomination.findUnique.mockResolvedValue({
      competition: { id: competitionA, federationId: federationA, status: 'in_progress' },
      discipline: { components: [] },
    });
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

  it('keeps legacy attempt upserts unavailable to judges while protecting the vote route', async () => {
    await withApp(async (app) => {
      const legacyAttempt = await app.inject({
        method: 'PUT',
        url: `/nominations/00000000-0000-4000-8000-000000000011/attempts/1`,
        headers: authHeaders('judge', { competitionId: competitionA }),
        payload: { weightKg: 40, result: 'good_lift' },
      });
      const unauthenticatedVote = await app.inject({
        method: 'PUT',
        url: `/nominations/00000000-0000-4000-8000-000000000011/attempts/1/judge-decision`,
        payload: { call: 'white' },
      });

      expect(legacyAttempt.statusCode).toBe(403);
      expect(legacyAttempt.json().error.code).toBe('forbidden');
      expect(unauthenticatedVote.statusCode).toBe(401);
      expect(unauthenticatedVote.json().error.code).toBe('unauthorized');
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

  it.each(['missing', 'allowed', 'hidden'])('public scoreboard photo consent: %s', async (mode) => {
    const athleteId = '00000000-0000-4000-8000-000000000501';
    prismaMock.nomination.findMany.mockResolvedValue([
      {
        id: 'nomination',
        entryNumber: 1,
        bodyWeightAtWeighIn: null,
        paidAmountKopecks: 0n,
        paymentStatus: 'unpaid',
        status: 'registered',
        athlete: {
          id: athleteId,
          lastName: 'Test',
          firstName: 'Athlete',
          middleName: null,
          dateOfBirth: new Date('1990-01-01'),
          privacyMode: mode === 'hidden' ? 'hidden' : 'public_results',
          photoUrl: `/api/athletes/${athleteId}/photo`,
          clubName: null,
        },
        discipline: {
          id: 'discipline',
          code: 'test',
          nameRu: 'Test',
          nameEn: 'Test',
          components: [],
        },
        division: { id: 'division', nameRu: 'Test', nameEn: 'Test' },
        weightClass: { id: 'weight', nameRu: 'Test', nameEn: 'Test' },
        declaredWeightClass: null,
        platform: null,
        flight: null,
        group: null,
        attempts: [],
      },
    ]);
    prismaMock.consent.findMany.mockResolvedValue(mode === 'missing' ? [] : [{ athleteId }]);
    await withApp(async (app) => {
      const response = await app.inject({ url: `/public/competitions/${competitionA}/scoreboard` });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().nominations[0].athlete.photoUrl).toBe(
        mode === 'allowed' ? `/api/athletes/${athleteId}/photo?federationId=${federationA}` : null,
      );
      expect(prismaMock.consent.findMany).toHaveBeenCalledWith({
        where: {
          athleteId: { in: [athleteId] },
          federationId: federationA,
          scope: 'photo_publication',
          revokedAt: null,
        },
        select: { athleteId: true },
      });
      expect(response.headers['cache-control']).toBe('private, no-store');
    });
  });
});
