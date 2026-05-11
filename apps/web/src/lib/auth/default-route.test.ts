import { describe, expect, it } from 'vitest';
import { defaultAuthenticatedRoute } from './default-route.js';
import type { AuthUser } from './types.js';

function userWithRoles(roles: AuthUser['roles']): AuthUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'User',
    roles,
  };
}

describe('defaultAuthenticatedRoute', () => {
  it('sends platform admins to the federation workspaces list', () => {
    expect(
      defaultAuthenticatedRoute(
        userWithRoles([{ role: 'platform_admin', federationId: null, competitionId: null }]),
      ),
    ).toBe('/federations');
  });

  it('keeps federation-scoped users on their federation workspace', () => {
    expect(
      defaultAuthenticatedRoute(
        userWithRoles([{ role: 'federation_admin', federationId: 'fed-1', competitionId: null }]),
      ),
    ).toBe('/federations/fed-1');
  });
});
