# Security checklist

Per-milestone checks against [ADR-0004](decisions/ADR-0004-security-baseline.md) and [ADR-0005](decisions/ADR-0005-logging-and-audit.md). Treat as a gate; missing items block release.

## M1 — Foundations

- [ ] argon2id with documented cost params, integration-tested
- [ ] JWT access (15 min) + opaque refresh with rotation + reuse detection
- [ ] Refresh-token family invalidation on reuse
- [ ] Rate limit: 5/min on `/auth/login`, 10/min on `/auth/refresh`, 60/min default
- [ ] `@fastify/helmet` configured with strict CSP (no `unsafe-inline`, no `unsafe-eval`), HSTS preload-eligible, `frame-ancestors 'none'`
- [ ] CORS allowlist via env, no `*` for credentialed routes
- [ ] Pino logger with PII redact list, module-tagged
- [ ] Request correlation: UUIDv7 → logger context → `X-Request-Id` response header
- [ ] `audit_log` Prisma model + migration; INSERT-only grant verified
- [ ] `withAudit(...)` wrapper used by login/logout/password-change
- [ ] gitleaks pre-commit hook
- [ ] `pnpm audit --audit-level=high` in CI
- [ ] Renovate config committed
- [ ] Sentry configured with `beforeSend` PII scrubber
- [ ] No `console.log` ESLint rule active in `apps/web`

## M2 — Core directories

- [ ] TOTP 2FA implemented; required for `federation_admin`
- [ ] Step-up auth: re-enter password before federation `securityKey` rotation
- [ ] All API routes declare minimum role; default is `deny`
- [ ] Direct object reference checks: every `?federationId=X` verifies caller scope
- [ ] Yandex.ID, Google, VK ID OAuth flows audited (state, nonce, PKCE)

## M3 — Competitions + nominations

- [ ] Public registration form: rate-limited, CAPTCHA on suspicious volume
- [ ] Athlete photo upload: MIME by magic bytes, max 5MB, server-side re-encode, sandbox path
- [ ] 152-ФЗ consent capture at registration: granular checkboxes, audit-logged
- [ ] Bulk import: CSV size cap, schema-strict, dry-run preview, audit-logged on commit

## M4 — Schedule

- [ ] Schedule edits audit-logged (who moved which flight)
- [ ] No regression on M1–M3 checks

## M5 — Tournament-day operations

- [ ] WebSocket auth: token verified on upgrade, role checked per topic
- [ ] Topic authorization: subscribers can only listen to topics in their scope
- [ ] Sync engine: per-aggregate queues; DLQ after 3 failed applies
- [ ] DLQ entries surfaced in admin UI with full diff
- [ ] Operator + judge actions audit-logged: attempt confirmation, override, rejudge
- [ ] Local SQLite at-rest encryption (SQLCipher) with key derived from user credential, optional per federation

## M6 — Reports + awards

- [ ] PDF generation: server-side, never user-controlled HTML in templates
- [ ] Result override flow: reason required, audit-logged with before/after
- [ ] Public results page respects `isPublicResultsClosed` flag

## M7 — Federation portal

- [x] Telegram bot link: federation code is single-use, expires in 1 hour, audit-logged on bind
- [ ] Federation `securityKey` rotation: step-up auth + email confirmation, audit-logged
- [ ] Receipt + writeoff creation: audit-logged with full diff
- [ ] Support tickets: rate-limited, no inline HTML rendering, attachments scanned

## M8 — Desktop binary

- [ ] Tauri CSP locked down (no `unsafe-eval`, no `unsafe-inline`)
- [ ] Updater pubkey verified at boot; signature failure logs error and skips update
- [ ] Local DB schema migration failures degrade gracefully, audit-logged on next sync
- [ ] Code-signing: Windows EV cert decision finalized

## M9 — Hardening + pilot

- [ ] External penetration test
- [ ] Load test with auth + audit on hot path; verify audit doesn't break under burst
- [ ] Privacy review: 152-ФЗ subject-rights endpoints work end-to-end
- [ ] Disclosure SLA documented in `SECURITY.md` (already present)
- [ ] РКН personal-data operator registration filed (legal team)

## Continuous (every sprint)

- [ ] No new dependency without `pnpm audit` clean
- [ ] No `console.log` slipping into prod
- [ ] No new privileged route without `withAudit`
- [ ] No new logged field without PII review
- [ ] No new feature without an isolation check (ADR-0003) AND a security check (this doc)
