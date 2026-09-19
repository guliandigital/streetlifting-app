import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { competitionOpsPlugin } from './competition-ops.js';

const db = vi.hoisted(() => ({
  nomination: { findUnique: vi.fn() },
  competition: { findUnique: vi.fn() },
  athlete: { findUnique: vi.fn() },
  judge: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('../lib/audit.js', () => ({ fromRequest: vi.fn(() => ({})), record: vi.fn() }));
vi.mock('../lib/db.js', async () => ({
  prisma: db,
  Prisma: (await vi.importActual('@prisma/client')).Prisma,
}));
const nominationId = '00000000-0000-4000-8000-000000000101';
const componentId = '00000000-0000-4000-8000-000000000102';
const competitionId = '00000000-0000-4000-8000-000000000103';
const federationId = '00000000-0000-4000-8000-000000000104';
beforeEach(() => {
  vi.resetAllMocks();
  db.nomination.findUnique.mockResolvedValue({
    id: nominationId,
    athleteId: 'athlete',
    isMandatePassed: true,
    competition: { id: competitionId, federationId, status: 'in_progress' },
    discipline: { attemptCount: 3, components: [{ id: componentId, attemptCount: 1 }] },
    flight: { platformId: 'platform' },
  });
  db.athlete.findUnique.mockResolvedValue({
    dateOfBirth: new Date('2000-02-03'),
    countryCode: 'AM',
  });
  db.judge.findUnique.mockResolvedValue(null);
});
async function submit(judge: boolean, attemptNumber = 1, alias = false) {
  const app = Fastify();
  app.addHook('preHandler', async (req) => {
    req.user = {
      id: 'staff',
      email: 'staff@example.test',
      displayName: 'Staff',
      roles: [{ role: judge ? 'judge' : 'secretary', federationId, competitionId: null }],
    };
  });
  await app.register(competitionOpsPlugin.register);
  try {
    return await app.inject({
      method: 'PUT',
      url: `/nominations/${nominationId}/attempts/${alias ? `${componentId}/` : ''}${attemptNumber}${judge ? '/judge-decision' : ''}`,
      payload: judge
        ? { componentId, call: 'white' }
        : { componentId, weightKg: 50, result: 'good_lift' },
    });
  } finally {
    await app.close();
  }
}
describe.each([false, true])('attempt integrity (judge=%s)', (judge) => {
  it('requires mandate approval', async () => {
    const n = await db.nomination.findUnique();
    db.nomination.findUnique.mockResolvedValue({ ...n, isMandatePassed: false });
    const res = await submit(judge);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('mandate_required');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it.each([
    { dateOfBirth: null, countryCode: 'AM' },
    { dateOfBirth: new Date(), countryCode: null },
  ])('rejects a profile that became incomplete after approval', async (profile) => {
    db.athlete.findUnique.mockResolvedValue(profile);
    expect((await submit(judge)).json().error.code).toBe('mandate_required');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('enforces the component limit rather than the parent discipline limit', async () => {
    const res = await submit(judge, 2);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('attempt_limit_exceeded');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('enforces the discipline limit when no components exist', async () => {
    const n = await db.nomination.findUnique();
    db.nomination.findUnique.mockResolvedValue({
      ...n,
      discipline: { attemptCount: 3, components: [] },
    });
    expect((await submit(judge, 4)).json().error.code).toBe('attempt_limit_exceeded');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
it('cannot bypass the limit through the component path alias', async () => {
  expect((await submit(false, 2, true)).json().error.code).toBe('attempt_limit_exceeded');
  expect(db.$transaction).not.toHaveBeenCalled();
});

it('accepts the last permitted operator attempt for an admitted athlete', async () => {
  const tx = {
    attempt: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: 'saved' })) },
    nomination: { findUnique: vi.fn(async () => null), findMany: vi.fn(async () => []) },
  };
  db.$transaction.mockImplementation(async (callback) => callback(tx));
  db.nomination.findUnique
    .mockResolvedValueOnce(await db.nomination.findUnique())
    .mockResolvedValue(null);
  const res = await submit(false, 1);
  expect(res.statusCode).toBe(200);
  expect(tx.attempt.create).toHaveBeenCalledOnce();
  expect(res.json().attempt.id).toBe('saved');
});
it('allows an admitted judge request through integrity checks to judge authorization', async () => {
  const res = await submit(true, 1);
  expect(res.statusCode).toBe(403);
  expect(res.json().error.code).toBe('judge_profile_missing');
  expect(db.judge.findUnique).toHaveBeenCalledOnce();
});

async function changeNomination(method: 'POST' | 'PATCH', payload: Record<string, unknown>) {
  const app = Fastify();
  app.addHook('preHandler', async (req) => {
    req.user = {
      id: 'staff',
      email: 'staff@example.test',
      displayName: 'Staff',
      roles: [{ role: 'secretary', federationId, competitionId: null }],
    };
  });
  await app.register(competitionOpsPlugin.register);
  try {
    return await app.inject({
      method,
      url:
        method === 'POST'
          ? `/competitions/${competitionId}/nominations`
          : `/nominations/${nominationId}`,
      payload,
    });
  } finally {
    await app.close();
  }
}
it.each(['on_platform', 'finished'])(
  'cannot create an unapproved nomination with status %s',
  async (status) => {
    db.competition.findUnique.mockResolvedValue({
      id: competitionId,
      federationId,
      status: 'in_progress',
    });
    const res = await changeNomination('POST', {
      athleteId: nominationId,
      disciplineId: componentId,
      divisionId: competitionId,
      weightClassId: federationId,
      status,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('mandate_required');
    expect(db.$transaction).not.toHaveBeenCalled();
  },
);
it('cannot revoke mandate while retaining on-platform status', async () => {
  const n = await db.nomination.findUnique();
  db.nomination.findUnique.mockResolvedValue({ ...n, status: 'on_platform' });
  const res = await changeNomination('PATCH', { isMandatePassed: false });
  expect(res.statusCode).toBe(409);
  expect(res.json().error.code).toBe('mandate_required');
});
it('cannot move an unapproved nomination directly to finished', async () => {
  const n = await db.nomination.findUnique();
  db.nomination.findUnique.mockResolvedValue({ ...n, status: 'draft', isMandatePassed: false });
  expect((await changeNomination('PATCH', { status: 'finished' })).json().error.code).toBe(
    'mandate_required',
  );
});
