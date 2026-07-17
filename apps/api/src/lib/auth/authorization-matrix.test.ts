import { describe, expect, it } from 'vitest';
import type { Role } from '@streetlifting/domain';
import {
  AUTHORIZATION_MATRIX,
  canAccessAuthorizationAction,
  type ActorWithRoles,
  type AuthorizationActionKey,
  type CompetitionScope,
} from './authorization-matrix.js';

const federationA = '00000000-0000-0000-0000-0000000000a1';
const federationB = '00000000-0000-0000-0000-0000000000b1';

const competitionA: CompetitionScope = {
  id: '00000000-0000-0000-0000-000000000101',
  federationId: federationA,
};

const competitionB: CompetitionScope = {
  id: '00000000-0000-0000-0000-000000000102',
  federationId: federationB,
};

function actor(
  role: Role,
  scope: { federationId?: string | null; competitionId?: string | null } = {},
): ActorWithRoles {
  return {
    roles: [
      {
        role,
        federationId: scope.federationId ?? null,
        competitionId: scope.competitionId ?? null,
      },
    ],
  };
}

function can(
  actorWithRoles: ActorWithRoles | null,
  action: AuthorizationActionKey,
  competition: CompetitionScope = competitionA,
): boolean {
  return canAccessAuthorizationAction(actorWithRoles, action, { competition });
}

describe('authorization matrix', () => {
  it('declares unique action keys', () => {
    const keys = AUTHORIZATION_MATRIX.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps public scoreboard role-free but honors closed public results', () => {
    expect(can(null, 'competition.publicScoreboard.read', competitionA)).toBe(true);
    expect(
      can(null, 'competition.publicScoreboard.read', {
        ...competitionA,
        isPublicResultsClosed: true,
      }),
    ).toBe(false);
  });

  it('allows platform_admin across federation and competition scopes', () => {
    const platformAdmin = actor('platform_admin');

    expect(
      canAccessAuthorizationAction(platformAdmin, 'federation.manage', {
        federationId: federationB,
      }),
    ).toBe(true);
    expect(can(platformAdmin, 'competition.ops.readFull', competitionB)).toBe(true);
    expect(can(platformAdmin, 'competition.reports.accountingExport', competitionB)).toBe(true);
  });

  it('denies out-of-scope federation_admin access', () => {
    const federationAdmin = actor('federation_admin', { federationId: federationA });

    expect(
      canAccessAuthorizationAction(federationAdmin, 'federation.manage', {
        federationId: federationA,
      }),
    ).toBe(true);
    expect(
      canAccessAuthorizationAction(federationAdmin, 'federation.manage', {
        federationId: federationB,
      }),
    ).toBe(false);
    expect(can(federationAdmin, 'competition.manage', competitionB)).toBe(false);
  });

  it('allows competition-scoped secretary to full ops but not another competition', () => {
    const secretary = actor('secretary', { competitionId: competitionA.id });

    expect(can(secretary, 'competition.ops.readFull', competitionA)).toBe(true);
    expect(can(secretary, 'competition.ops.setup', competitionA)).toBe(true);
    expect(can(secretary, 'competition.ops.readFull', competitionB)).toBe(false);
  });

  it('keeps judge access limited to live surfaces and individual decisions', () => {
    const judge = actor('judge', { competitionId: competitionA.id });

    expect(can(judge, 'competition.ops.readLive')).toBe(true);
    expect(can(judge, 'competition.reports.protocolExport')).toBe(true);
    expect(can(judge, 'competition.ops.judgeDecisions')).toBe(true);
    expect(can(judge, 'competition.ops.attempts')).toBe(false);
    expect(can(judge, 'competition.ops.readFull')).toBe(false);
    expect(can(judge, 'competition.ops.attemptNotes')).toBe(false);
    expect(can(judge, 'competition.reports.accountingExport')).toBe(false);
  });

  it('allows accountant accounting exports without granting live ops', () => {
    const accountant = actor('accountant', { federationId: federationA });

    expect(can(accountant, 'competition.read')).toBe(true);
    expect(can(accountant, 'competition.reports.accountingExport')).toBe(true);
    expect(can(accountant, 'competition.ops.readLive')).toBe(false);
    expect(can(accountant, 'competition.reports.protocolExport')).toBe(false);
  });

  it('filters competition lists by requested federation scope', () => {
    const viewer = actor('viewer', { federationId: federationA });

    expect(canAccessAuthorizationAction(viewer, 'competition.list')).toBe(true);
    expect(
      canAccessAuthorizationAction(viewer, 'competition.list', { federationId: federationA }),
    ).toBe(true);
    expect(
      canAccessAuthorizationAction(viewer, 'competition.list', { federationId: federationB }),
    ).toBe(false);
  });
});
