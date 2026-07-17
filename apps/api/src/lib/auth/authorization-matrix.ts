import type { Role } from '@streetlifting/domain';

export interface RoleAssignmentLike {
  role: Role;
  federationId: string | null;
  competitionId: string | null;
}

export interface ActorWithRoles {
  roles: readonly RoleAssignmentLike[];
}

export interface CompetitionScope {
  id: string;
  federationId: string;
  isPublicResultsClosed?: boolean;
}

export interface AuthorizationTarget {
  federationId?: string;
  competition?: CompetitionScope;
}

export type AuthorizationActionKey =
  | 'federation.read'
  | 'federation.manage'
  | 'federation.accounting'
  | 'competition.list'
  | 'competition.read'
  | 'competition.manage'
  | 'competition.ops.readFull'
  | 'competition.ops.readLive'
  | 'competition.ops.setup'
  | 'competition.ops.judgeAssignments'
  | 'competition.ops.nominations'
  | 'competition.ops.nominationHeadJudgeUpdate'
  | 'competition.ops.attempts'
  | 'competition.ops.judgeDecisions'
  | 'competition.ops.attemptNotes'
  | 'competition.reports.protocolExport'
  | 'competition.reports.accountingExport'
  | 'competition.publicScoreboard.read';

export type AuthorizationScope = 'platform' | 'federation' | 'competition' | 'public';

export interface AuthorizationMatrixEntry {
  key: AuthorizationActionKey;
  module: 'federations' | 'competitions' | 'competition-ops' | 'reports' | 'public';
  routePatterns: readonly string[];
  methods: readonly string[];
  auth: 'required' | 'public';
  roles: readonly Role[];
  scope: AuthorizationScope;
  notes: string;
}

export const FULL_OPS_READ_ROLES = [
  'federation_admin',
  'secretary',
] as const satisfies readonly Role[];

export const LIVE_OPS_READ_ROLES = [
  'federation_admin',
  'secretary',
  'head_judge',
  'judge',
  'scoreboard_operator',
] as const satisfies readonly Role[];

export const SECRETARIAT_WRITE_ROLES = [
  'federation_admin',
  'secretary',
] as const satisfies readonly Role[];

export const ATTEMPT_WRITE_ROLES = [
  'federation_admin',
  'secretary',
  'head_judge',
  'scoreboard_operator',
] as const satisfies readonly Role[];

export const JUDGE_DECISION_ROLES = ['head_judge', 'judge'] as const satisfies readonly Role[];

export const ACCOUNTING_ROLES = [
  'federation_admin',
  'accountant',
] as const satisfies readonly Role[];

export const HEAD_JUDGE_NOMINATION_WRITE_ROLES = [
  'federation_admin',
  'secretary',
  'head_judge',
] as const satisfies readonly Role[];

export const AUTHORIZATION_MATRIX = [
  {
    key: 'federation.read',
    module: 'federations',
    routePatterns: ['/federations', '/federations/:id'],
    methods: ['GET'],
    auth: 'required',
    roles: [
      'federation_admin',
      'secretary',
      'head_judge',
      'judge',
      'scoreboard_operator',
      'speaker',
      'accountant',
      'viewer',
    ],
    scope: 'federation',
    notes: 'platform_admin sees all; any federation-scoped role sees that federation.',
  },
  {
    key: 'federation.manage',
    module: 'federations',
    routePatterns: [
      '/federations',
      '/federations/:id',
      '/federations/:id/plate-sets',
      '/federations/:id/attachments',
    ],
    methods: ['POST', 'PATCH', 'DELETE'],
    auth: 'required',
    roles: ['federation_admin'],
    scope: 'federation',
    notes: 'platform_admin is implicit; federation_admin must match federation scope.',
  },
  {
    key: 'federation.accounting',
    module: 'federations',
    routePatterns: ['/federations/:id/receipts', '/federations/:id/writeoffs'],
    methods: ['POST'],
    auth: 'required',
    roles: ACCOUNTING_ROLES,
    scope: 'federation',
    notes: 'Receipts and writeoffs are restricted to federation_admin/accountant.',
  },
  {
    key: 'competition.list',
    module: 'competitions',
    routePatterns: ['/competitions'],
    methods: ['GET'],
    auth: 'required',
    roles: [
      'federation_admin',
      'secretary',
      'head_judge',
      'judge',
      'scoreboard_operator',
      'speaker',
      'accountant',
      'viewer',
    ],
    scope: 'federation',
    notes: 'Result set is filtered to federationId/competitionId scopes.',
  },
  {
    key: 'competition.read',
    module: 'competitions',
    routePatterns: ['/competitions/:id'],
    methods: ['GET'],
    auth: 'required',
    roles: [
      'federation_admin',
      'secretary',
      'head_judge',
      'judge',
      'scoreboard_operator',
      'speaker',
      'accountant',
      'viewer',
    ],
    scope: 'competition',
    notes: 'Any matching federation or competition scope can read the competition shell.',
  },
  {
    key: 'competition.manage',
    module: 'competitions',
    routePatterns: ['/competitions', '/competitions/:id'],
    methods: ['POST', 'PATCH'],
    auth: 'required',
    roles: ['federation_admin'],
    scope: 'federation',
    notes: 'Competition create/update is federation_admin scoped to the owning federation.',
  },
  {
    key: 'competition.ops.readFull',
    module: 'competition-ops',
    routePatterns: ['/competitions/:id/ops'],
    methods: ['GET'],
    auth: 'required',
    roles: FULL_OPS_READ_ROLES,
    scope: 'competition',
    notes: 'Full ops payload includes secretariat details; live roles use live-ops instead.',
  },
  {
    key: 'competition.ops.readLive',
    module: 'competition-ops',
    routePatterns: ['/competitions/:id/live-ops', '/competitions/:id/scoreboard'],
    methods: ['GET'],
    auth: 'required',
    roles: LIVE_OPS_READ_ROLES,
    scope: 'competition',
    notes: 'Live payload is suitable for judges, scoreboard operator, and platform surfaces.',
  },
  {
    key: 'competition.ops.setup',
    module: 'competition-ops',
    routePatterns: ['/competitions/:id/setup/default'],
    methods: ['POST'],
    auth: 'required',
    roles: SECRETARIAT_WRITE_ROLES,
    scope: 'competition',
    notes: 'Default setup mutates tournament structure and is secretariat-only.',
  },
  {
    key: 'competition.ops.judgeAssignments',
    module: 'competition-ops',
    routePatterns: ['/competitions/:id/judge-assignments', '/judge-assignments/:assignmentId'],
    methods: ['POST', 'DELETE'],
    auth: 'required',
    roles: SECRETARIAT_WRITE_ROLES,
    scope: 'competition',
    notes: 'Judge assignment writes are federation_admin/secretary scoped.',
  },
  {
    key: 'competition.ops.nominations',
    module: 'competition-ops',
    routePatterns: ['/competitions/:id/nominations', '/competitions/:id/nominations/draw'],
    methods: ['POST'],
    auth: 'required',
    roles: SECRETARIAT_WRITE_ROLES,
    scope: 'competition',
    notes: 'Nomination create/draw is federation_admin/secretary scoped.',
  },
  {
    key: 'competition.ops.nominationHeadJudgeUpdate',
    module: 'competition-ops',
    routePatterns: ['/nominations/:nominationId'],
    methods: ['PATCH'],
    auth: 'required',
    roles: HEAD_JUDGE_NOMINATION_WRITE_ROLES,
    scope: 'competition',
    notes: 'head_judge can update only operational fields enforced by route-level field guard.',
  },
  {
    key: 'competition.ops.attempts',
    module: 'competition-ops',
    routePatterns: ['/nominations/:nominationId/attempts/:attemptNumber'],
    methods: ['PUT'],
    auth: 'required',
    roles: ATTEMPT_WRITE_ROLES,
    scope: 'competition',
    notes: 'Attempt writes are restricted to operators and senior competition roles.',
  },
  {
    key: 'competition.ops.judgeDecisions',
    module: 'competition-ops',
    routePatterns: ['/nominations/:nominationId/attempts/:attemptNumber/judge-decision'],
    methods: ['PUT'],
    auth: 'required',
    roles: JUDGE_DECISION_ROLES,
    scope: 'competition',
    notes: 'Judge calls require a linked judge profile and an effective platform assignment.',
  },
  {
    key: 'competition.ops.attemptNotes',
    module: 'competition-ops',
    routePatterns: ['/nominations/:nominationId/attempts/:attemptNumber'],
    methods: ['PUT'],
    auth: 'required',
    roles: SECRETARIAT_WRITE_ROLES,
    scope: 'competition',
    notes: 'Attempt notes are restricted to federation_admin/secretary.',
  },
  {
    key: 'competition.reports.protocolExport',
    module: 'reports',
    routePatterns: ['/competitions/:id/protocol.csv', '/competitions/:id/protocol.xlsx'],
    methods: ['GET'],
    auth: 'required',
    roles: LIVE_OPS_READ_ROLES,
    scope: 'competition',
    notes: 'Protocol exports follow live ops visibility.',
  },
  {
    key: 'competition.reports.accountingExport',
    module: 'reports',
    routePatterns: ['/competitions/:id/accounting.csv', '/competitions/:id/accounting.xlsx'],
    methods: ['GET'],
    auth: 'required',
    roles: ACCOUNTING_ROLES,
    scope: 'competition',
    notes: 'Accounting exports are restricted to federation_admin/accountant.',
  },
  {
    key: 'competition.publicScoreboard.read',
    module: 'public',
    routePatterns: ['/public/competitions/:id/scoreboard'],
    methods: ['GET'],
    auth: 'public',
    roles: [],
    scope: 'public',
    notes: 'Public route is role-free but must honor isPublicResultsClosed.',
  },
] as const satisfies readonly AuthorizationMatrixEntry[];

export function isPlatformAdmin(actor: ActorWithRoles | null | undefined): boolean {
  return actor?.roles.some((assignment) => assignment.role === 'platform_admin') ?? false;
}

export function hasAnyRole(actor: ActorWithRoles | null | undefined): boolean {
  return (actor?.roles.length ?? 0) > 0;
}

export function hasFederationRole(
  actor: ActorWithRoles | null | undefined,
  federationId: string,
  roles: readonly Role[],
): boolean {
  if (!actor) return false;
  return actor.roles.some(
    (assignment) =>
      assignment.role === 'platform_admin' ||
      (roles.includes(assignment.role) && assignment.federationId === federationId),
  );
}

export function hasCompetitionRole(
  actor: ActorWithRoles | null | undefined,
  competition: CompetitionScope,
  roles: readonly Role[],
): boolean {
  if (!actor) return false;
  return actor.roles.some(
    (assignment) =>
      assignment.role === 'platform_admin' ||
      (roles.includes(assignment.role) &&
        (assignment.federationId === competition.federationId ||
          assignment.competitionId === competition.id)),
  );
}

export function canReadFederation(
  actor: ActorWithRoles | null | undefined,
  federationId: string,
): boolean {
  if (!actor) return false;
  return actor.roles.some(
    (assignment) =>
      assignment.role === 'platform_admin' || assignment.federationId === federationId,
  );
}

export function canReadCompetition(
  actor: ActorWithRoles | null | undefined,
  competition: CompetitionScope,
): boolean {
  if (!actor) return false;
  return actor.roles.some(
    (assignment) =>
      assignment.role === 'platform_admin' ||
      assignment.federationId === competition.federationId ||
      assignment.competitionId === competition.id,
  );
}

export function canAccessAuthorizationAction(
  actor: ActorWithRoles | null | undefined,
  action: AuthorizationActionKey,
  target: AuthorizationTarget = {},
): boolean {
  switch (action) {
    case 'competition.publicScoreboard.read':
      return target.competition?.isPublicResultsClosed !== true;
    case 'competition.list':
      if (!actor) return false;
      if (target.federationId) return canReadFederation(actor, target.federationId);
      return isPlatformAdmin(actor) || hasAnyRole(actor);
    case 'federation.read':
      return target.federationId ? canReadFederation(actor, target.federationId) : false;
    case 'federation.manage':
      return target.federationId
        ? hasFederationRole(actor, target.federationId, ['federation_admin'])
        : false;
    case 'federation.accounting':
      return target.federationId
        ? hasFederationRole(actor, target.federationId, ACCOUNTING_ROLES)
        : false;
    case 'competition.read':
      return target.competition ? canReadCompetition(actor, target.competition) : false;
    case 'competition.manage':
      return target.competition
        ? hasFederationRole(actor, target.competition.federationId, ['federation_admin'])
        : target.federationId
          ? hasFederationRole(actor, target.federationId, ['federation_admin'])
          : false;
    case 'competition.ops.readFull':
      return target.competition
        ? hasCompetitionRole(actor, target.competition, FULL_OPS_READ_ROLES)
        : false;
    case 'competition.ops.readLive':
    case 'competition.reports.protocolExport':
      return target.competition
        ? hasCompetitionRole(actor, target.competition, LIVE_OPS_READ_ROLES)
        : false;
    case 'competition.ops.setup':
    case 'competition.ops.judgeAssignments':
    case 'competition.ops.nominations':
    case 'competition.ops.attemptNotes':
      return target.competition
        ? hasCompetitionRole(actor, target.competition, SECRETARIAT_WRITE_ROLES)
        : false;
    case 'competition.ops.nominationHeadJudgeUpdate':
      return target.competition
        ? hasCompetitionRole(actor, target.competition, HEAD_JUDGE_NOMINATION_WRITE_ROLES)
        : false;
    case 'competition.ops.attempts':
      return target.competition
        ? hasCompetitionRole(actor, target.competition, ATTEMPT_WRITE_ROLES)
        : false;
    case 'competition.ops.judgeDecisions':
      return target.competition
        ? hasCompetitionRole(actor, target.competition, JUDGE_DECISION_ROLES)
        : false;
    case 'competition.reports.accountingExport':
      return target.competition
        ? hasCompetitionRole(actor, target.competition, ACCOUNTING_ROLES)
        : false;
  }
}
