# Security checklist

Per-milestone checks against [ADR-0004](decisions/ADR-0004-security-baseline.md) and [ADR-0005](decisions/ADR-0005-logging-and-audit.md). Treat as a gate; missing items block release.

Status reconciled against the code on 2026-09-19 (see [launch-readiness-plan.md](launch-readiness-plan.md)). Every `[x]` names the file that implements it; every open item says what is missing, not just that it is missing.

## M1 — Foundations

- [x] argon2id with documented cost params, integration-tested — `apps/api/src/lib/auth/password.ts` (64 MiB / t=3 / p=4), `password.test.ts`
- [x] JWT access (15 min) + opaque refresh with rotation + reuse detection — `apps/api/src/lib/auth/tokens.ts`
- [x] Refresh-token family invalidation on reuse — `rotateRefreshToken` revokes the whole family
- [x] Rate limit on auth routes — `apps/api/src/plugins/auth.ts`: register 3/min, login 5/min, refresh 10/min, password change 5/min; global default 120/min in production (`RATE_LIMIT_MAX`), 600/min in development
- [ ] `@fastify/helmet` strict CSP — API sets `frame-ancestors 'none'`, HSTS preload in production, but `style-src` still allows `'unsafe-inline'` (`apps/api/src/index.ts`). **Open:** the browser client is served by nginx (`deploy/nginx/streetlifting.app.conf`), which sets X-Frame-Options / nosniff / Referrer-Policy but **no `Content-Security-Policy` header at all** — the SPA has no CSP in production
- [x] CORS allowlist via env, no `*` for credentialed routes — `CORS_ORIGIN` comma list, `credentials: true`
- [x] Pino logger with PII redact list, module-tagged — `apps/api/src/lib/logger.ts` (`REDACT_PATHS`, `moduleLogger`)
- [x] Request correlation: request id → logger child → `X-Request-Id` response header — `apps/api/src/lib/request-context.ts`
- [ ] `audit_log` Prisma model + migration; INSERT-only grant verified — model and migration exist (`apps/api/prisma/schema.prisma` → `AuditLog`). **Open:** no database-level INSERT-only grant; the API role can update/delete audit rows
- [x] Audit wrapper used by login/logout/password-change — `auth.login.succeeded/failed`, `auth.logout`, `auth.password.changed/change_failed`, `auth.refresh.succeeded`
- [x] gitleaks pre-commit hook — `lefthook.yml`
- [x] `pnpm audit --prod --audit-level=high` in CI — `.github/workflows/ci.yml`; accepted exceptions live in `package.json → pnpm.auditConfig.ignoreGhsas` with a reason in the PR that added them
- [x] Renovate config committed — `renovate.json`
- [x] Sentry configured with `beforeSend` PII scrubber, `sendDefaultPii: false` — `apps/api/src/lib/sentry.ts`, `apps/web/src/lib/sentry.ts`
- [x] No `console.log` ESLint rule active in `apps/web` — `eslint.config.js` (`no-console: error`)

## M2 — Core directories

- [ ] TOTP 2FA implemented; required for `federation_admin` — **Open:** not started (product decision in launch plan §2.3)
- [ ] Step-up auth: re-enter password before federation `securityKey` rotation — **Open:** not started
- [x] All API routes declare minimum role; default is `deny` — `attachUser` sets `req.user = null`, routes opt in via `requireAuth` / `requireRole`; executable matrix `apps/api/src/lib/auth/authorization-matrix.ts` + `route-authorization.test.ts`
- [x] Direct object reference checks: every federation/competition-scoped route verifies caller scope — covered by `route-authorization.test.ts` (out-of-scope 403 cases)
- [x] OAuth flows audited — Yandex.ID / Google / VK ID were **superseded by ISF ID** (ADR-0012): RSA-signed assertions, JWKS, `jti` replay table, no query-parameter tokens; `apps/api/src/plugins/isf-id-auth.test.ts`, `apps/isf-id/src/*.test.ts`

## M3 — Competitions + nominations

- [ ] Public registration form: rate-limited, CAPTCHA on suspicious volume — rate limit 30/min per route is in place (`apps/api/src/plugins/public-registration.ts`). **Open:** no CAPTCHA / abuse challenge (launch plan §2.1)
- [ ] Athlete photo upload: MIME by magic bytes, max size, server-side re-encode, sandbox path — size caps (photo 2 MiB, attachments 5 MiB) and path sandbox are done (`apps/api/src/plugins/athletes.ts`). **Open:** MIME is trusted from the client; no magic-byte check, no re-encode (launch plan §1.1)
- [x] 152-ФЗ consent capture at registration: granular scopes (`data_processing`, `public_results`, `photo_publication`), persisted in `consent`, audit-logged as `public_registration.created`
- [ ] Bulk import: CSV size cap, schema-strict, dry-run preview, audit-logged on commit — **Open:** bulk import is not implemented

## M4 — Schedule

- [ ] Schedule edits audit-logged (who moved which flight) — `competition.flights_auto_planned` is audited. **Open:** manual flight/group moves are not
- [x] No regression on M1–M3 checks — CI gates (`lint`, `typecheck`, `test`, fresh-database migrations, browser e2e)

## M5 — Tournament-day operations

- [x] WebSocket auth: token verified on upgrade, role checked per topic — `apps/api/src/plugins/live-updates.ts` (`Sec-WebSocket-Protocol` bearer, scope re-check), `live-updates.test.ts`
- [x] Topic authorization: subscribers only receive no-PII invalidation events for competitions in their scope
- [ ] Sync engine: per-aggregate queues; DLQ after 3 failed applies — **Deferred** with desktop (launch plan §2.7)
- [ ] DLQ entries surfaced in admin UI — **Deferred** with desktop
- [x] Operator + judge actions audit-logged — `attempt.upserted`, `attempt.judge_decision_submitted`, `nomination.updated`, `nomination.draw_applied`
- [ ] Local SQLite at-rest encryption — **Deferred** with desktop

## M6 — Reports + awards

- [ ] PDF generation: server-side — **Open:** printables are browser-rendered (`report-printables.tsx`); no server renderer (launch plan §2.4)
- [ ] Result override flow: reason required, audit-logged with before/after — **Open:** not implemented
- [x] Public results page respects `isPublicResultsClosed` — `authorization-matrix.test.ts` "public scoreboard closed gate"

## M7 — Federation portal

- [ ] Telegram bot link: single-use expiring code — **Open:** `telegramSubscriptionCode` is a static displayed value (launch plan §2.6)
- [ ] Federation `securityKey` rotation: step-up auth + email confirmation — **Open:** not implemented
- [x] Receipt + writeoff creation audit-logged — `federation.receipt.created`, `federation.writeoff.created`
- [ ] Support tickets: rate-limited, no inline HTML rendering, attachments scanned — React escapes message bodies; **Open:** no per-route rate limit beyond the global one, no attachment scanning

## M8 — Desktop binary

Deferred until after the web pilot (roadmap scope update 2026-05-09). Nothing below is started.

- [ ] Tauri CSP locked down
- [ ] Updater pubkey verified at boot
- [ ] Local DB schema migration failures degrade gracefully
- [ ] Code-signing: Windows EV cert decision finalized

## M9 — Hardening + pilot

- [ ] External penetration test
- [ ] Load test with auth + audit on hot path
- [ ] Privacy review: 152-ФЗ subject-rights endpoints work end-to-end — consent revocation exists (`passport.consent.revoked`); **Open:** export / erasure endpoints
- [x] Disclosure SLA documented in `SECURITY.md`
- [ ] РКН personal-data operator registration filed (legal)

## Continuous (every sprint)

- [x] No new dependency without `pnpm audit` clean — enforced in CI for production dependencies
- [x] No `console.log` slipping into prod — ESLint
- [ ] No new privileged route without an audit record — convention, not enforced; `route-authorization.test.ts` covers access but not audit emission
- [ ] No new logged field without PII review — convention (`REDACT_PATHS` comment)
- [x] No new feature without an isolation check (ADR-0003) — ESLint bans sibling-feature and sibling-plugin imports (`eslint.config.js`, verified with probe imports on 2026-09-19)
