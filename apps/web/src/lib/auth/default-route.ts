import type { AuthUser } from './types.js';

const FEDERATION_HOME_ROLES = new Set(['federation_admin', 'secretary', 'accountant']);

export function defaultAuthenticatedRoute(user: AuthUser | null): string {
  if (user?.roles.some((assignment) => assignment.role === 'platform_admin')) return '/federations';

  const federationRole = user?.roles.find(
    (assignment) => assignment.federationId && FEDERATION_HOME_ROLES.has(assignment.role),
  );

  if (federationRole?.federationId) return `/federations/${federationRole.federationId}`;
  return '/me';
}
