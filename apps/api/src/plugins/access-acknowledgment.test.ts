import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authPlugin } from './auth.js';
import { attachUser, authenticateAccessToken, requireRole } from '../lib/auth/middleware.js';
import { ACCESS_ACKNOWLEDGMENT_VERSION as version } from '../lib/access-acknowledgment.js';

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  roleAssignment: { findFirst: vi.fn(), updateMany: vi.fn() },
}));
const audit = vi.hoisted(() => vi.fn());
vi.mock('../lib/db.js', async () => ({
  prisma: db,
  Prisma: (await vi.importActual('@prisma/client')).Prisma,
}));
vi.mock('../lib/auth/tokens.js', async (original) => ({
  ...(await original<object>()),
  verifyAccessToken: vi.fn(async (token: string) => (token === 'test' ? { sub: 'user-a' } : null)),
}));
vi.mock('../lib/audit.js', () => ({
  fromRequest: () => ({}),
  withAudit: audit,
}));
const grantId = '00000000-0000-4000-8000-000000000301';
const federationId = '00000000-0000-4000-8000-0000000000a1';
const grant = {
  id: grantId,
  userId: 'user-a',
  role: 'secretary',
  federationId,
  competitionId: null,
  revokedAt: null,
  acknowledgedAt: null,
  acknowledgedTextVersion: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  db.user.findUnique.mockResolvedValue({
    id: 'user-a',
    email: 'a@example.test',
    displayName: 'A',
    roleAssignments: [grant],
  });
  db.roleAssignment.findFirst.mockResolvedValue({ ...grant });
  db.roleAssignment.updateMany.mockResolvedValue({ count: 1 });
  audit.mockImplementation(async (_entry, work) => work(db));
});

async function app() {
  const instance = Fastify();
  instance.addHook('preHandler', attachUser);
  await instance.register(authPlugin.register);
  instance.get(
    '/protected',
    { preHandler: requireRole('secretary', { federationId }) },
    async () => ({ ok: true }),
  );
  return instance;
}

describe('access acknowledgment', () => {
  it('keeps an unaccepted or old-version role inactive and preserves its scope', async () => {
    for (const acknowledgedTextVersion of [null, 'obsolete']) {
      db.user.findUnique.mockResolvedValueOnce({
        id: 'user-a',
        roleAssignments: [{ ...grant, acknowledgedAt: new Date(), acknowledgedTextVersion }],
      });
      const user = await authenticateAccessToken('test');
      expect(user?.roles).toEqual([]);
      expect(user?.pendingAcknowledgments).toEqual([
        { roleAssignmentId: grantId, role: 'secretary', federationId, competitionId: null },
      ]);
    }
    expect(db.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          roleAssignments: expect.objectContaining({ where: { revokedAt: null } }),
        }),
      }),
    );
  });

  it('denies protected HTTP access until accepted, then still denies another federation', async () => {
    const instance = await app();
    try {
      const headers = { authorization: 'Bearer test' };
      expect((await instance.inject({ url: '/protected', headers })).statusCode).toBe(403);
      for (const scope of [federationId, 'other-federation']) {
        db.user.findUnique.mockResolvedValue({
          id: 'user-a',
          roleAssignments: [
            {
              ...grant,
              federationId: scope,
              acknowledgedAt: new Date(),
              acknowledgedTextVersion: version,
            },
          ],
        });
        expect((await instance.inject({ url: '/protected', headers })).statusCode).toBe(
          scope === federationId ? 200 : 403,
        );
      }
    } finally {
      await instance.close();
    }
  });

  it.each([
    ['anonymous', 401],
    ['other-owner', 404],
    ['revoked', 404],
    ['old-text', 409],
    ['valid', 200],
  ])(
    'handles %s confirmation without activating foreign or revoked roles',
    async (scenario, expected) => {
      if (scenario === 'other-owner' || scenario === 'revoked')
        db.roleAssignment.findFirst.mockResolvedValue(null);
      const instance = await app();
      try {
        const response = await instance.inject({
          method: 'POST',
          url: `/auth/role-assignments/${grantId}/acknowledge`,
          headers: scenario === 'anonymous' ? {} : { authorization: 'Bearer test' },
          payload: { textVersion: scenario === 'old-text' ? 'obsolete' : version },
        });
        expect(response.statusCode, response.body).toBe(expected);
        if (expected !== 200) expect(db.roleAssignment.updateMany).not.toHaveBeenCalled();
        else {
          expect(db.roleAssignment.findFirst).toHaveBeenCalledWith({
            where: { id: grantId, userId: 'user-a', revokedAt: null },
          });
          expect(db.roleAssignment.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({ id: grantId, userId: 'user-a', revokedAt: null }),
            }),
          );
          expect(audit).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'role.access_acknowledged',
              scopeFederationId: federationId,
            }),
            expect.any(Function),
          );
        }
      } finally {
        await instance.close();
      }
    },
  );

  it('does not overwrite evidence on a repeated acknowledgment', async () => {
    db.roleAssignment.findFirst.mockResolvedValue({
      ...grant,
      acknowledgedAt: new Date(),
      acknowledgedTextVersion: version,
    });
    const instance = await app();
    try {
      expect(
        (
          await instance.inject({
            method: 'POST',
            url: `/auth/role-assignments/${grantId}/acknowledge`,
            headers: { authorization: 'Bearer test' },
            payload: { textVersion: version },
          })
        ).statusCode,
      ).toBe(200);
      expect(db.roleAssignment.updateMany).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    } finally {
      await instance.close();
    }
  });

  it('rejects a role revoked between lookup and write', async () => {
    db.roleAssignment.updateMany.mockResolvedValue({ count: 0 });
    const instance = await app();
    try {
      expect(
        (
          await instance.inject({
            method: 'POST',
            url: `/auth/role-assignments/${grantId}/acknowledge`,
            headers: { authorization: 'Bearer test' },
            payload: { textVersion: version },
          })
        ).statusCode,
      ).toBe(409);
    } finally {
      await instance.close();
    }
  });
});
