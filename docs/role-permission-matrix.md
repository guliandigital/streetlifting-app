# Role and permission matrix

Date: 2026-06-11

Source of truth for the executable matrix: `apps/api/src/lib/auth/authorization-matrix.ts`.

## Scope model

- `platform_admin` is global and implicitly bypasses federation/competition scope checks.
- Federation-scoped roles match by `RoleAssignment.federationId`.
- Competition-scoped roles match by `RoleAssignment.competitionId`.
- Competition actions accept either the owning `federationId` scope or the exact `competitionId` scope unless the route has a stricter rule.
- Public scoreboard is unauthenticated, but must deny access when `isPublicResultsClosed` is true.

## Matrix

| Action                                      | Routes                                            | Roles                                                                         | Scope                  | Notes                                                  |
| ------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------ |
| `federation.read`                           | `GET /federations`, `GET /federations/:id`        | any federation-scoped staff/view role                                         | federation             | Result is filtered by visible federation IDs.          |
| `federation.manage`                         | federation create/update, plate sets, attachments | `federation_admin`                                                            | federation             | `platform_admin` implicit.                             |
| `federation.accounting`                     | receipts, writeoffs                               | `federation_admin`, `accountant`                                              | federation             | Billing-adjacent writes require audit.                 |
| `competition.list`                          | `GET /competitions`                               | any scoped role                                                               | federation/competition | Optional federation filter must be in scope.           |
| `competition.read`                          | `GET /competitions/:id`                           | any scoped role                                                               | federation/competition | Reads competition shell and related setup.             |
| `competition.manage`                        | competition create/update                         | `federation_admin`                                                            | federation             | Owns status and settings changes.                      |
| `competition.ops.readFull`                  | `GET /competitions/:id/ops`                       | `federation_admin`, `secretary`                                               | competition            | Full secretariat payload.                              |
| `competition.ops.readLive`                  | live ops, scoreboard                              | `federation_admin`, `secretary`, `head_judge`, `judge`, `scoreboard_operator` | competition            | Reduced live payload for tournament-day screens.       |
| `competition.ops.setup`                     | default setup                                     | `federation_admin`, `secretary`                                               | competition            | Mutates tournament structure.                          |
| `competition.ops.judgeAssignments`          | judge assignment create/delete                    | `federation_admin`, `secretary`                                               | competition            | Assignment writes are secretariat-only.                |
| `competition.ops.nominations`               | nomination create/draw                            | `federation_admin`, `secretary`                                               | competition            | Head judge can patch only selected operational fields. |
| `competition.ops.nominationHeadJudgeUpdate` | nomination patch                                  | `federation_admin`, `secretary`, `head_judge`                                 | competition            | Field-level guard still applies.                       |
| `competition.ops.attempts`                  | attempt upsert                                    | `federation_admin`, `secretary`, `head_judge`, `judge`, `scoreboard_operator` | competition            | Attempt notes are restricted separately.               |
| `competition.ops.attemptNotes`              | attempt upsert with notes                         | `federation_admin`, `secretary`                                               | competition            | Prevents platform roles from writing private notes.    |
| `competition.reports.protocolExport`        | protocol CSV/XLSX                                 | live ops roles                                                                | competition            | Follows live scoreboard visibility.                    |
| `competition.reports.accountingExport`      | accounting CSV/XLSX                               | `federation_admin`, `accountant`                                              | competition            | Finance export only.                                   |
| `competition.publicScoreboard.read`         | public scoreboard                                 | public                                                                        | public                 | Deny when public results are closed.                   |

## Verification status

- Unit coverage: `apps/api/src/lib/auth/authorization-matrix.test.ts`.
- Route-level coverage: `apps/api/src/lib/auth/route-authorization.test.ts`.
- Covered decisions: platform global access, federation out-of-scope denial, competition-scoped secretary access, judge live/full split, accountant export split, public scoreboard closed gate.
- Covered route groups: protected-route 401, federation out-of-scope, competition list out-of-scope, full/live ops split, protocol/accounting report split, public scoreboard closed gate.
- Remaining hardening: wire the matrix into plugin helpers route by route, then add injected Fastify tests for every privileged mutation and an effective-role admin script/view.
