import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerRequestContext } from '../lib/request-context.js';
import { cabinetPlugin } from './cabinet.js';

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  athlete: { findUnique: vi.fn() },
  judge: { findUnique: vi.fn() },
  judgeAssignment: { findMany: vi.fn() },
  officialProfile: { findUnique: vi.fn() },
  competitionTeamMember: { findMany: vi.fn() },
  passportReviewRequest: { findMany: vi.fn() },
  attachment: { findMany: vi.fn() },
  federation: { findMany: vi.fn() },
  roleAssignment: { findMany: vi.fn() },
}));

vi.mock('../lib/db.js', () => ({ prisma: prismaMock }));

const user = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'cabinet@example.test',
  displayName: 'Cabinet User',
  roles: [
    {
      role: 'federation_admin' as const,
      federationId: '00000000-0000-0000-0000-000000000002',
      competitionId: null,
    },
  ],
};
const managedFederationId = '00000000-0000-0000-0000-000000000002';

async function buildApp(authenticated = true) {
  const app = Fastify({ logger: false });
  await registerRequestContext(app);
  app.addHook('preHandler', async (req) => {
    req.user = authenticated ? user : null;
  });
  await app.register(cabinetPlugin.register);
  return app;
}

describe('cabinet overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ isfSubjectId: null });
    prismaMock.athlete.findUnique.mockResolvedValue(null);
    prismaMock.judge.findUnique.mockResolvedValue(null);
    prismaMock.judgeAssignment.findMany.mockResolvedValue([]);
    prismaMock.officialProfile.findUnique.mockResolvedValue(null);
    prismaMock.competitionTeamMember.findMany.mockResolvedValue([]);
    prismaMock.passportReviewRequest.findMany.mockResolvedValue([]);
    prismaMock.attachment.findMany.mockResolvedValue([]);
    prismaMock.federation.findMany.mockResolvedValue([]);
    prismaMock.roleAssignment.findMany.mockResolvedValue([]);
  });

  it('requires an authenticated user', async () => {
    const app = await buildApp(false);
    const response = await app.inject({ method: 'GET', url: '/cabinet/overview' });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('returns only profiles linked to the signed-in user', async () => {
    prismaMock.athlete.findUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000003',
      lastName: 'Иванов',
      firstName: 'Иван',
      middleName: null,
      federationCardNumber: 'A-1',
      clubName: 'Club',
      _count: { nominations: 3, records: 1 },
      nominations: [],
      records: [],
      sportRankAwards: [],
    });
    prismaMock.judge.findUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000004',
      lastName: 'Петров',
      firstName: 'Пётр',
      middleName: null,
      categoryRu: 'I категория',
      categoryEn: null,
      cardNumber: 'J-1',
      cityRegion: 'Москва',
      _count: { assignments: 2 },
      assignments: [],
    });

    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/cabinet/overview' });

    expect(response.statusCode).toBe(200);
    expect(response.json().athlete).toMatchObject({
      displayName: 'Иванов Иван',
      appearancesTotal: 3,
    });
    expect(response.json().official).toMatchObject({
      displayName: 'Петров Пётр',
      assignmentsTotal: 0,
    });
    expect(response.json().official.upcomingAssignments).toEqual([]);
    expect(prismaMock.athlete.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: user.id } }),
    );
    expect(JSON.stringify(prismaMock.athlete.findUnique.mock.calls[0]?.[0])).toContain(
      '"status":"finished"',
    );
    expect(JSON.stringify(prismaMock.athlete.findUnique.mock.calls[0]?.[0])).toContain(
      '"ratifiedAt":{"not":null}',
    );
    expect(JSON.stringify(prismaMock.judge.findUnique.mock.calls[0]?.[0])).toContain('"finalized"');
    expect(
      JSON.stringify(prismaMock.competitionTeamMember.findMany.mock.calls[0]?.[0].where),
    ).toContain(user.id);
    expect(prismaMock.federation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          affiliationStatus: 'national_member',
          affiliationBody: { in: ['isf', 'eusf'] },
        },
      }),
    );
    await app.close();
  });

  it('includes pending review requests only for federations the user manages', async () => {
    prismaMock.federation.findMany.mockResolvedValue([
      {
        id: managedFederationId,
        code: 'ISF-RU',
        nameRu: 'Федерация стритлифтинга России',
        nameEn: 'Federation of Streetlifting Russia',
        countryCode: 'RU',
        affiliationBody: 'isf',
      },
    ]);
    prismaMock.roleAssignment.findMany.mockResolvedValue(user.roles);
    prismaMock.passportReviewRequest.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: '00000000-0000-0000-0000-000000000005',
        federationId: managedFederationId,
        kind: 'official_profile',
        payload: { message: 'Please review' },
        submittedAt: new Date('2026-07-24T00:00:00.000Z'),
        applicant: { displayName: 'ISF Applicant', email: 'applicant@example.test' },
        supportingAttachment: null,
      },
    ]);

    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/cabinet/overview' });

    expect(response.statusCode).toBe(200);
    expect(response.json().management).toMatchObject({
      federations: [{ id: managedFederationId }],
      requests: [{ kind: 'official_profile', applicant: { email: 'applicant@example.test' } }],
    });
    expect(prismaMock.passportReviewRequest.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { federationId: { in: [managedFederationId] }, status: 'pending' },
      }),
    );
    await app.close();
  });
});
