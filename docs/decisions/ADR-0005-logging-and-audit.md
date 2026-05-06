# ADR-0005: Logging and audit

**Status**: Accepted (2026-05-07)
**Decision-makers**: Ararat Gulyan + Claude

## Decision

Two independent log streams. They are separate concepts with separate guarantees; do not mix them.

| | Operational logs | Audit logs |
|---|---|---|
| Purpose | Debugging, monitoring, performance | Compliance, forensics, "who did what" |
| Storage | Local files + Sentry/observability backend | PostgreSQL `audit_log` table, append-only |
| Retention | 30 days (operational) | ≥ 1 year (compliance) |
| Failure mode | Best-effort. Log loss is annoying, not fatal | Failure on a sensitive write **blocks the action** |
| Contains PII? | NO — actively scrubbed | YES (necessary), encrypted at rest |
| Mutability | n/a | Insert-only by app role; only DBA can prune after retention |
| Schema | Pino JSON, free-form fields | Strict columns enforced by domain schema |

## Operational logging

### Library

`pino` for both API and Tauri-Rust desktop (via `tracing-subscriber` with JSON format on the Rust side, normalized to the same schema). React side uses a thin wrapper that mirrors the structure.

### Required fields per line

| Field | Source |
|---|---|
| `time` | Pino default (Unix ms) |
| `level` | trace/debug/info/warn/error/fatal |
| `module` | Logger child binding — every plugin/feature has its own child |
| `requestId` | UUIDv7 generated at the API edge per request, propagated via `X-Request-Id` header |
| `userId` | When request is authenticated |
| `msg` | Human-readable message |
| Additional structured fields | per call |

### Levels and policy

- `trace` — disabled in prod
- `debug` — disabled in prod
- `info` — startup, plugin load, request start/end (sampled at 1% in prod for non-mutating GET), background-job lifecycle
- `warn` — recoverable issues: rate-limit hit, retried sync event, third-party degraded
- `error` — request failures, plugin load failure, sync DLQ entries
- `fatal` — process is exiting

### PII scrubbing (mandatory)

Pino redact paths, applied globally:

```
password
token
accessToken
refreshToken
authorization
cookie
*.password
*.token
*.secret
req.headers.authorization
req.headers.cookie
res.headers["set-cookie"]
body.password
body.email
body.phone
user.email
user.phone
user.dateOfBirth
athlete.dateOfBirth
```

Anything new entering the system that holds a secret or direct PII goes onto this list **before** it's logged. If unsure, hash before logging.

### Correlation

- API generates `requestId` (UUIDv7) per request and attaches to all child log lines
- Returns `X-Request-Id` header in the response
- Frontend includes `X-Request-Id` of the originating user action when calling the API
- Tauri-side actions log with the same id when synced to the server
- A single user action across web → api → sync → desktop has one `requestId` end-to-end

### Storage and shipping

- Local: pino-pretty in dev; raw JSON to stdout in prod, captured by systemd-journal on the reg.ru host
- Centralized observability: Sentry for errors + breadcrumbs (M1); add OpenTelemetry traces later (post-GA)
- Sentry `beforeSend` hook strips PII redundantly (defense in depth)

### Frontend specifics

- Console output disabled in production builds (a wrapper logger no-ops in prod, sends to Sentry instead)
- Error boundaries log via the wrapper with the module tag
- No `console.log` direct calls — lint rule (M1)

## Audit logging

### What gets audit-logged

Sensitive actions only. Not every CRUD. Examples (full list maintained in `docs/security-checklist.md`):

- Authentication: login success, login failure, logout, password reset request, password change, 2FA enable/disable
- Authorization: role grants, role revocations, scope changes
- Federation administration: settings changes (especially `securityKey` rotation), accountant/cashier name changes
- Billing: receipt creation, writeoff creation, balance adjustments
- Competition lifecycle: status transitions (`registration_open` → `closed`, `in_progress` → `finalized`)
- Result overrides: judge decision changes after a flight finishes, manual place adjustments
- Data subject requests: export, correction, deletion (152-ФЗ)
- Bulk operations: bulk import, bulk delete, bulk role assignment

### Schema

`audit_log` table columns:

| Column | Type | Notes |
|---|---|---|
| `id` | UUIDv7 | PK |
| `occurred_at` | timestamptz | Server time, NOT NULL |
| `actor_user_id` | UUID | NULL only for system actions |
| `actor_ip` | inet | NULLable |
| `actor_user_agent` | text | Truncated to 512 chars |
| `action` | text | Stable, dotted code: `federation.security_key.rotated`, `nomination.attempt.overridden` |
| `scope_federation_id` | UUID | NULL for global actions |
| `scope_competition_id` | UUID | When relevant |
| `target_type` | text | e.g., `athlete`, `nomination`, `receipt` |
| `target_id` | UUID | The entity acted upon |
| `before` | jsonb | Diff: prior state of changed fields |
| `after` | jsonb | Diff: new state |
| `request_id` | UUID | Joins to operational log |
| `result` | text | `success` / `failure` / `denied` |
| `notes` | text | Free-form, optional |

### Database guarantees

- Created via Prisma migration
- Application role grants: `INSERT` only. **No `UPDATE` or `DELETE`** for the application
- Pruning happens via a separate, audited DBA script after retention expires
- Indexed on `(occurred_at)`, `(actor_user_id, occurred_at)`, `(scope_federation_id, occurred_at)`, `(action, occurred_at)`

### Failure handling (interacts with ADR-0003)

Audit-log writes for sensitive actions are **synchronous and required**. If the audit insert fails:

1. The action's transaction rolls back
2. The user gets an error
3. An operational log entry at `error` level captures the audit-log failure

This is the **principled exception** to the modular isolation rule: an unhealthy audit module *does* affect dependent modules — by design. We will not have privileged writes without an audit trail.

For non-sensitive operations (most reads, sync events for ordinary edits), audit log is not on the path; their isolation is normal.

### Privacy

- The audit log contains PII by necessity (names, IDs)
- Encrypted at rest via Postgres TDE / disk-level encryption on the reg.ru host
- Access to the table itself is restricted to DBA + read-only audit-viewer role for incident response
- Subject-access requests (152-ФЗ): user's audit entries are exportable to that user (sanitized for actor data when actor was someone else)

## Implementation primitives in the skeleton

Already wired in `apps/api/src/lib/`:

- `logger.ts` — pino factory with module tagging and the redact list
- `request-context.ts` — UUIDv7 per request, attached to logger context, returned as `X-Request-Id`

Will land at M1:

- `audit.service.ts` — typed `audit.record(...)` API
- `audit-log` Prisma model + migration
- `withAudit(...)` transaction wrapper used by every privileged service method

Will land at M5 (sync engine):

- Per-aggregate sync queues that emit operational logs on retry/DLQ but do NOT write audit log unless the synced event is itself a sensitive action

## Out-of-scope for V1

- Cryptographic chaining of audit entries (hash-chain / Merkle tree) — V2+ international track
- Real-time SIEM forwarding — out of scope; reg.ru host + Sentry is enough
- Tamper-evident WORM storage — out of scope
