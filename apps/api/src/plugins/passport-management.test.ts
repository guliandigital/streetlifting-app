import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerRequestContext } from '../lib/request-context.js';
import { passportManagementPlugin } from './passport-management.js';

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  competition: { findUnique: vi.fn() },
  judgeAssignment: { findMany: vi.fn(), findFirst: vi.fn() },
  competitionTeamMember: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  attachment: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  passportReviewRequest: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  athlete: { findUnique: vi.fn() },
  officialProfile: { findUnique: vi.fn(), upsert: vi.fn() },
  officialCredential: { create: vi.fn() },
  sportRankAward: { create: vi.fn() },
  consent: { findFirst: vi.fn(), update: vi.fn() },
  federation: { findUnique: vi.fn() },
}));

const auditMock = vi.hoisted(() => ({
  fromRequest: vi.fn(() => ({ actorIp: null, actorUserAgent: null, requestId: 'test-request' })),
  withAudit: vi.fn(async (_entry: unknown, work: (tx: typeof prismaMock) => Promise<unknown>) =>
    work(prismaMock),
  ),
}));

vi.mock('../lib/db.js', () => ({ prisma: prismaMock }));
vi.mock('../lib/audit.js', () => auditMock);

const federationId = '00000000-0000-0000-0000-000000000002';
const competitionId = '00000000-0000-0000-0000-000000000003';
const memberUserId = '00000000-0000-0000-0000-000000000004';
const teamMemberId = '00000000-0000-0000-0000-000000000005';
const assignmentId = '00000000-0000-0000-0000-000000000006';

const manager = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'manager@example.test',
  displayName: 'Manager',
  roles: [{ role: 'federation_admin' as const, federationId, competitionId: null }],
};

async function buildApp(user = manager) {
  const app = Fastify({ logger: false });
  await registerRequestContext(app);
  app.addHook('preHandler', async (req) => {
    req.user = user;
  });
  await app.register(passportManagementPlugin.register);
  return app;
}

function competition() {
  return { id: competitionId, federationId, status: 'in_progress' };
}

function existingTeamMember(status: 'invited' | 'confirmed' | 'completed' = 'confirmed') {
  return {
    id: teamMemberId,
    competitionId,
    userId: memberUserId,
    role: 'judge',
    platformId: null,
    judgeAssignmentId: assignmentId,
    memberNameSnapshot: 'Judge User',
    status,
    invitedAt: new Date('2026-01-01'),
    confirmedAt: status === 'invited' ? null : new Date('2026-01-02'),
    completedAt: status === 'completed' ? new Date('2026-01-03') : null,
    correctionOfId: null,
    competition: { federationId, status: 'in_progress' },
  };
}

describe('passport team workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.competition.findUnique.mockResolvedValue(competition());
    prismaMock.user.findUnique.mockResolvedValue({ displayName: 'Judge User' });
    prismaMock.judgeAssignment.findMany.mockResolvedValue([]);
  });

  it('rejects a judge assignment that belongs to another competition or user', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/competitions/${competitionId}/team-members`,
      payload: { userId: memberUserId, role: 'judge', judgeAssignmentId: assignmentId },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('judge_assignment_mismatch');
    await app.close();
  });

  it('automatically links the single matching judge assignment when inviting a judge', async () => {
    prismaMock.judgeAssignment.findMany.mockResolvedValue([{ id: assignmentId }]);
    prismaMock.competitionTeamMember.create.mockImplementation(async ({ data }) => ({
      id: teamMemberId,
      ...data,
    }));
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: `/competitions/${competitionId}/team-members`,
      payload: { userId: memberUserId, role: 'judge' },
    });

    expect(response.statusCode).toBe(201);
    expect(prismaMock.competitionTeamMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ judgeAssignmentId: assignmentId }),
      }),
    );
    await app.close();
  });

  it('confirms an invitation only for its owner', async () => {
    const invitee = { ...manager, id: memberUserId, roles: [] };
    prismaMock.competitionTeamMember.findUnique.mockResolvedValue(existingTeamMember('invited'));
    prismaMock.competitionTeamMember.update.mockResolvedValue({
      id: teamMemberId,
      status: 'confirmed',
    });
    const app = await buildApp(invitee);
    const response = await app.inject({
      method: 'POST',
      url: `/competition-team-members/${teamMemberId}/respond`,
      payload: { status: 'confirmed' },
    });

    expect(response.statusCode).toBe(200);
    expect(prismaMock.competitionTeamMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'confirmed' }) }),
    );
    await app.close();
  });

  it('completes confirmed membership and creates a separate correction record', async () => {
    prismaMock.competitionTeamMember.findUnique
      .mockResolvedValueOnce(existingTeamMember('confirmed'))
      .mockResolvedValueOnce(existingTeamMember('completed'));
    prismaMock.competitionTeamMember.update.mockResolvedValue({
      id: teamMemberId,
      status: 'completed',
    });
    prismaMock.judgeAssignment.findMany.mockResolvedValue([{ id: assignmentId }]);
    prismaMock.competitionTeamMember.create.mockImplementation(async ({ data }) => ({
      id: '00000000-0000-0000-0000-000000000007',
      ...data,
    }));
    const app = await buildApp();
    const completed = await app.inject({
      method: 'POST',
      url: `/competition-team-members/${teamMemberId}/complete`,
    });
    const corrected = await app.inject({
      method: 'POST',
      url: `/competition-team-members/${teamMemberId}/corrections`,
      payload: { role: 'judge', status: 'completed' },
    });

    expect(completed.statusCode).toBe(200);
    expect(corrected.statusCode).toBe(201);
    expect(prismaMock.competitionTeamMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          correctionOfId: teamMemberId,
          judgeAssignmentId: assignmentId,
        }),
      }),
    );
    await app.close();
  });
});
