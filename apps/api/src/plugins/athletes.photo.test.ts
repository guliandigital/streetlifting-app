import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { athletesPlugin } from './athletes.js';
import type { AuthenticatedUser } from '../lib/auth/middleware.js';

const db = vi.hoisted(() => ({
  athlete: { findUnique: vi.fn(), findFirst: vi.fn() },
  consent: { findFirst: vi.fn() },
  nomination: { findFirst: vi.fn() },
  attachment: { findFirst: vi.fn() },
}));
const getFile = vi.hoisted(() => vi.fn());
vi.mock('../lib/db.js', async () => ({
  prisma: db,
  Prisma: (await vi.importActual('@prisma/client')).Prisma,
}));
vi.mock('../lib/storage.js', () => ({
  storage: { get: getFile },
  storageKey: vi.fn(),
  MAX_UPLOAD_CONTENT_BYTES: 3145728,
  UPLOAD_BODY_LIMIT_BYTES: 4500000,
}));
const athleteId = '00000000-0000-4000-8000-000000000101';
const federationId = '00000000-0000-4000-8000-000000000201';
const competitionId = '00000000-0000-4000-8000-000000000301';
const anotherId = '00000000-0000-4000-8000-000000000401';
let user: AuthenticatedUser | null;
let consent: { federationId: string | null; revokedAt: Date | null; closed: boolean } | null;

beforeEach(() => {
  vi.resetAllMocks();
  user = null;
  consent = null;
  db.athlete.findUnique.mockResolvedValue({
    id: athleteId,
    userId: 'owner',
    privacyMode: 'public_results',
  });
  db.attachment.findFirst.mockResolvedValue({
    id: 'photo',
    storagePath: 'private/photo',
    mimeType: 'image/png',
  });
  getFile.mockResolvedValue(Buffer.from('photo-content'));
  db.consent.findFirst.mockImplementation(async ({ where }) => {
    expect(where).toMatchObject({ athleteId, scope: 'photo_publication', revokedAt: null });
    if (where.federationId) expect(where.federation).toEqual({ isPublicResultsClosed: false });
    return consent &&
      !consent.revokedAt &&
      !consent.closed &&
      where.federationId === consent.federationId
      ? { id: 'consent' }
      : null;
  });
  db.nomination.findFirst.mockImplementation(async ({ where }) => {
    expect(where.athleteId).toBe(athleteId);
    return where.competition.OR.some(
      (scope: { id?: string; federationId?: string }) =>
        scope.federationId === federationId || scope.id === competitionId,
    )
      ? { id: 'nomination' }
      : null;
  });
});

async function download(query = '', method: 'GET' | 'HEAD' = 'GET', authorization?: string) {
  const app = Fastify();
  app.addHook('preHandler', async (req) => {
    req.user = user;
  });
  await app.register(athletesPlugin.register);
  try {
    return await app.inject({
      method,
      url: `/athletes/${athleteId}/photo${query}`,
      headers: authorization ? { authorization } : {},
    });
  } finally {
    await app.close();
  }
}

function actor(
  role: AuthenticatedUser['roles'][number]['role'],
  scope: { federationId?: string; competitionId?: string } = {},
) {
  user = {
    id: 'staff',
    email: 'staff@example.test',
    displayName: 'Staff',
    roles: [
      {
        role,
        federationId: scope.federationId ?? null,
        competitionId: scope.competitionId ?? null,
      },
    ],
  };
}

describe('athlete photo privacy', () => {
  it('cannot bypass photo privacy through the generic attachment download', async () => {
    actor('athlete', { federationId: anotherId });
    db.attachment.findFirst.mockResolvedValue({
      id: anotherId,
      kind: 'athlete_photo',
      storagePath: 'private/photo',
      mimeType: 'image/png',
    });
    const app = Fastify();
    app.addHook('preHandler', async (req) => {
      req.user = user;
    });
    await app.register(athletesPlugin.register);
    try {
      const response = await app.inject({
        url: `/athletes/${athleteId}/attachments/${anotherId}/download`,
      });
      expect(response.statusCode).toBe(404);
      expect(getFile).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it('returns 401 for an expired token so the authenticated client can refresh', async () => {
    expect((await download('', 'GET', 'Bearer expired')).statusCode).toBe(401);
    expect(getFile).not.toHaveBeenCalled();
  });
  it('does not read storage without consent', async () => {
    const response = await download();
    expect(response.statusCode).toBe(404);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(db.attachment.findFirst).not.toHaveBeenCalled();
    expect(getFile).not.toHaveBeenCalled();
  });

  it('allows public download only in the consenting federation', async () => {
    consent = { federationId, revokedAt: null, closed: false };
    expect((await download()).statusCode).toBe(404);
    expect((await download(`?federationId=${anotherId}`)).statusCode).toBe(404);
    const response = await download(`?federationId=${federationId}`);
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('photo-content');
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers.vary).toBe('Authorization');
    expect(getFile).toHaveBeenCalledTimes(1);
  });

  it('supports explicit global consent without borrowing a federation consent', async () => {
    consent = { federationId: null, revokedAt: null, closed: false };
    expect((await download()).statusCode).toBe(200);
    expect((await download(`?federationId=${federationId}`)).statusCode).toBe(404);
  });

  it.each(['hidden', 'revoked', 'closed'] as const)(
    'denies %s public photos, including HEAD',
    async (mode) => {
      consent = {
        federationId,
        revokedAt: mode === 'revoked' ? new Date() : null,
        closed: mode === 'closed',
      };
      if (mode === 'hidden')
        db.athlete.findUnique.mockResolvedValue({
          id: athleteId,
          userId: 'owner',
          privacyMode: 'hidden',
        });
      expect((await download(`?federationId=${federationId}`)).statusCode).toBe(404);
      expect((await download(`?federationId=${federationId}`, 'HEAD')).statusCode).toBe(404);
      expect(getFile).not.toHaveBeenCalled();
    },
  );

  it('rechecks a revoked consent on the next request', async () => {
    consent = { federationId, revokedAt: null, closed: false };
    expect((await download(`?federationId=${federationId}`)).statusCode).toBe(200);
    consent.revokedAt = new Date();
    expect((await download(`?federationId=${federationId}`)).statusCode).toBe(404);
    expect(getFile).toHaveBeenCalledTimes(1);
  });

  it.each(['owner', 'platform_admin', 'federation_admin', 'judge'] as const)(
    'allows private preview for %s',
    async (role) => {
      db.athlete.findUnique.mockResolvedValue({
        id: athleteId,
        userId: 'owner',
        privacyMode: 'hidden',
      });
      if (role === 'owner')
        user = { id: 'owner', email: 'owner@example.test', displayName: 'Owner', roles: [] };
      else actor(role, role === 'judge' ? { competitionId } : { federationId });
      const response = await download();
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(db.consent.findFirst).not.toHaveBeenCalled();
    },
  );

  it.each([
    'foreign-federation',
    'foreign-competition',
    'unscoped',
    'pending',
    'unrelated-role',
  ] as const)('denies private access to %s', async (scenario) => {
    actor(
      scenario === 'unrelated-role' ? 'athlete' : 'judge',
      scenario === 'foreign-competition'
        ? { competitionId: anotherId }
        : scenario === 'unscoped'
          ? {}
          : { federationId: scenario === 'foreign-federation' ? anotherId : federationId },
    );
    if (scenario === 'pending') user!.roles = [];
    expect((await download()).statusCode).toBe(404);
    expect(getFile).not.toHaveBeenCalled();
  });

  it('handles missing athletes and invalid scopes without accessing storage', async () => {
    db.athlete.findUnique.mockResolvedValue(null);
    expect((await download()).statusCode).toBe(404);
    expect((await download('?federationId=invalid')).statusCode).toBe(400);
    expect(getFile).not.toHaveBeenCalled();
  });
});
