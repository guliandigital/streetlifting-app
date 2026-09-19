import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { athletesPlugin } from './athletes.js';
import type { AuthenticatedUser } from '../lib/auth/middleware.js';

const db = vi.hoisted(() => ({
  athlete: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
}));
vi.mock('../lib/db.js', async () => ({
  prisma: db,
  Prisma: (await vi.importActual('@prisma/client')).Prisma,
}));
const athleteId = '00000000-0000-4000-8000-000000000101';
const fed = '00000000-0000-4000-8000-000000000201';
const meet = '00000000-0000-4000-8000-000000000301';
let user: AuthenticatedUser | null;
beforeEach(() => {
  vi.resetAllMocks();
  user = { id: 'staff', email: 'staff@example.test', displayName: 'Staff', roles: [] };
  db.athlete.findFirst.mockResolvedValue(null);
  db.athlete.findMany.mockResolvedValue([]);
  db.athlete.count.mockResolvedValue(0);
  db.athlete.findUnique.mockResolvedValue({
    id: athleteId,
    dateOfBirth: '1990-02-03',
    city: 'private',
  });
});
async function get(path: string) {
  const app = Fastify();
  app.addHook('preHandler', async (req) => {
    req.user = user;
  });
  await app.register(athletesPlugin.register);
  try {
    return await app.inject({ method: 'GET', url: path });
  } finally {
    await app.close();
  }
}
describe('full athlete card access', () => {
  it('requires authentication', async () => {
    user = null;
    expect((await get(`/athletes/${athleteId}`)).statusCode).toBe(401);
    expect(db.athlete.findFirst).not.toHaveBeenCalled();
  });
  it.each(['', '/appearances', '/records', '/documents', `/attachments/${meet}/download`])(
    'blocks foreign card and related route %s before fetching content',
    async (suffix) => {
      user!.roles = [{ role: 'secretary', federationId: fed, competitionId: null }];
      const res = await get(`/athletes/${athleteId}${suffix}`);
      expect(res.statusCode).toBe(404);
      expect(res.body).not.toContain('private');
      expect(db.athlete.findUnique).not.toHaveBeenCalled();
      expect(db.athlete.findFirst).toHaveBeenCalledWith({
        where: {
          AND: [
            { id: athleteId },
            {
              OR: [
                { userId: 'staff' },
                { nominations: { some: { competition: { OR: [{ federationId: fed }] } } } },
              ],
            },
          ],
        },
        select: { id: true },
      });
    },
  );
  it.each(['judge', 'viewer', 'accountant'] as const)(
    'does not grant full cards to %s',
    async (role) => {
      user!.roles = [{ role, federationId: fed, competitionId: null }];
      await get('/athletes');
      expect(db.athlete.findMany.mock.calls[0]![0].where).toEqual({
        AND: [{ OR: [{ userId: 'staff' }] }],
      });
      expect(db.athlete.count.mock.calls[0]![0].where).toEqual(
        db.athlete.findMany.mock.calls[0]![0].where,
      );
    },
  );
  it('keeps a competition assignment restricted to that competition even with a federation id', async () => {
    user!.roles = [{ role: 'secretary', federationId: fed, competitionId: meet }];
    await get('/athletes');
    expect(db.athlete.findMany.mock.calls[0]![0].where.AND[0].OR[1]).toEqual({
      nominations: { some: { competition: { OR: [{ federationId: fed, id: meet }] } } },
    });
  });
  it.each(['owner', 'secretary', 'platform_admin'] as const)(
    'allows an authorized %s card',
    async (role) => {
      if (role === 'owner') user!.id = 'owner';
      else
        user!.roles = [
          { role, federationId: role === 'secretary' ? fed : null, competitionId: null },
        ];
      db.athlete.findFirst.mockResolvedValue({ id: athleteId });
      const res = await get(`/athletes/${athleteId}`);
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.json().athlete.city).toBe('private');
      if (role === 'owner')
        expect(db.athlete.findFirst.mock.calls[0]![0].where.AND[1]).toEqual({
          OR: [{ userId: 'owner' }],
        });
    },
  );
});
