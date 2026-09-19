import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disciplinesPlugin } from './disciplines.js';

const db = vi.hoisted(() => ({
  discipline: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock('../lib/db.js', async () => ({
  prisma: db,
  Prisma: (await vi.importActual('@prisma/client')).Prisma,
}));
vi.mock('../lib/audit.js', () => ({
  fromRequest: vi.fn(() => ({})),
  withAudit: vi.fn(async (_entry, run) => run(db)),
}));
const id = '00000000-0000-4000-8000-000000000101';
const discipline = {
  id,
  nameRu: 'Двоеборье',
  format: 'three_attempts_max',
  attemptCount: 3,
  fixedWeightKg: null,
  applyVeteranCoefficient: true,
  family: 'streetlifting',
  equipment: 'pullup_bar',
};
beforeEach(() => {
  vi.resetAllMocks();
  db.discipline.findUnique.mockResolvedValue(discipline);
  db.discipline.findUniqueOrThrow.mockResolvedValue({
    ...discipline,
    _count: { nominations: 1, records: 0, weightClasses: 0 },
  });
  db.discipline.update.mockResolvedValue(discipline);
});
async function patch(body: Record<string, unknown>) {
  const app = Fastify();
  app.addHook('preHandler', async (req) => {
    req.user = {
      id: 'admin',
      email: 'admin@example.test',
      displayName: 'Admin',
      roles: [{ role: 'platform_admin', federationId: null, competitionId: null }],
    };
  });
  await app.register(disciplinesPlugin.register);
  try {
    return await app.inject({ method: 'PATCH', url: `/disciplines/${id}`, payload: body });
  } finally {
    await app.close();
  }
}
describe('used discipline rules', () => {
  it.each([
    { attemptCount: 1 },
    { format: 'reps_to_failure' },
    { fixedWeightKg: 24 },
    { applyVeteranCoefficient: false },
  ])('rejects rule changes: %j', async (body) => {
    const response = await patch(body);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('discipline_rules_locked');
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    expect(db.discipline.update).not.toHaveBeenCalled();
  });
  it.each(['records', 'weightClasses'])(
    'protects a discipline used only by %s',
    async (relation) => {
      db.discipline.findUniqueOrThrow.mockResolvedValue({
        ...discipline,
        _count: { nominations: 0, records: 0, weightClasses: 0, [relation]: 1 },
      });
      expect((await patch({ attemptCount: 1 })).statusCode).toBe(409);
      expect(db.discipline.update).not.toHaveBeenCalled();
    },
  );
  it('allows name corrections and unchanged rule fields', async () => {
    expect((await patch({ nameRu: 'Исправленное название', attemptCount: 3 })).statusCode).toBe(
      200,
    );
    expect(db.discipline.update).toHaveBeenCalledOnce();
  });
  it('allows rule changes before any usage', async () => {
    db.discipline.findUniqueOrThrow.mockResolvedValue({
      ...discipline,
      _count: { nominations: 0, records: 0, weightClasses: 0 },
    });
    expect((await patch({ attemptCount: 1 })).statusCode).toBe(200);
  });
});
