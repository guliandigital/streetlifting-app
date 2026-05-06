# ADR-0004: Security baseline

**Status**: Accepted (2026-05-07)
**Decision-makers**: Ararat Gulyan + Claude

## Decision

The project adopts the security baseline below as its non-negotiable floor. Every milestone in `roadmap-v2.md` must include a "**Security check**" item against the relevant section. Severity-1 violations block release.

This ADR is the canonical security contract; deviations require a follow-up ADR.

## Standards we align to

- **OWASP Top 10 (2021)** + **OWASP API Security Top 10 (2023)**
- **OWASP ASVS Level 2** (target tier for V1)
- **NIST SP 800-63B** for password and authentication guidance
- **Russian 152-ФЗ** (personal-data law) — applicable; we are RU jurisdiction (`ИП Гулян А. Г.`)
- **Russian 149-ФЗ** (information law) — relevant for audit-log retention
- **GDPR-equivalent practices** — designed-for, not in scope for V1; the international ООО track (V2+ per legal memo) will activate the full GDPR posture

## Authentication

| Requirement | Rule |
|---|---|
| Password hashing | argon2id, default cost ≥ m=64MB t=3 p=4. No bcrypt, no SHA-anything, no MD5 |
| Password length | min 12, max 256, no composition rules — per NIST SP 800-63B |
| Compromised passwords | check against HIBP k-anonymity API at password-set time |
| Access token | JWT, EdDSA preferred (or RS256), TTL 15 min |
| Refresh token | opaque random 32 bytes, hashed in DB, rotated on every use, family-tracked for reuse detection (RFC 6749 §10.4) |
| Token storage in browser | in-memory + sessionStorage. **NEVER localStorage** (XSS-exfil risk) |
| Logout | revokes refresh-token family server-side |
| 2FA | TOTP supported (M2+); required for `federation_admin` role at M7 |
| Step-up auth | required for: federation `securityKey` rotation, billing changes, role grants outside one's own scope |
| OAuth/SSO | Yandex.ID, Google, VK ID supported (M2+) — never MS/Apple in V1 |
| Account lockout | exponential backoff per IP+account after 5 failed logins; never silent ban (always surface the lock) |

## Authorization

| Requirement | Rule |
|---|---|
| Model | scoped RBAC (`federation_admin`, `secretary`, `head_judge`, `judge`, `scoreboard_operator`, `speaker`, `athlete`, `accountant`, `viewer`) |
| Enforcement | server-side at every API route. Client-side gating is UX only, never trusted |
| Default | deny. Each route declares the minimum role explicitly |
| Scoping | every privileged operation checks the scope (federation/competition) — having `secretary` in federation A does NOT grant `secretary` in federation B |
| Direct object references | never expose UUIDs the caller has no scope on. Always check (`?federationId=X` must verify caller has access to X) |

## Input validation

| Requirement | Rule |
|---|---|
| Schema | every API input is a Zod schema from `packages/domain` |
| Strict mode | object schemas use `.strict()` at the API boundary — unknown fields are 400, not silently dropped |
| File uploads | MIME validation by magic bytes (not extension), size limits per endpoint, re-encode images server-side, store outside web root |
| URL inputs | reject `javascript:`, `data:`, raw IPs, internal-network ranges (SSRF) |
| Path inputs | reject `..`, NUL, absolute paths; resolve and verify within sandbox |

## Output / response

- Set strict security headers via `@fastify/helmet`: `Content-Security-Policy`, `Strict-Transport-Security` (max-age=31536000; includeSubDomains; preload), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` locking down everything unused
- CSP: strict, no `unsafe-inline`, no `unsafe-eval`. Nonces for required inline. `frame-ancestors 'none'`
- CORS: explicit origin allowlist via env. Never `*` for credentialed routes
- Errors never leak stack traces, file paths, SQL fragments. Production error responses: `{ error: { code, message, requestId } }`. Detail goes to logs

## Transport

- TLS 1.2+ only, prefer 1.3. HSTS preload-eligible
- Production hostnames behind nginx/Caddy with auto-renewing Let's Encrypt
- WebSocket upgraded over `wss://` only

## Database

- All queries via Prisma (parameterized). Raw SQL allowed only via reviewed helpers, audit-logged
- Application DB role has minimum privileges: `SELECT/INSERT/UPDATE/DELETE` on app tables, **no schema modification**
- Audit-log table has `INSERT`-only grant for the app role (no UPDATE/DELETE)
- Connection strings come from env, never code; pooled (PgBouncer) in production

## Secrets

- Never in source. `.env.example` lists keys with empty values
- Production secrets in reg.ru server env (chmod 600, owned by service user)
- CI secrets in GitHub Actions secret store; never echoed in logs
- Tauri signing private key: `~/.tauri/streetlifting-os.key` on maintainer host + `TAURI_SIGNING_PRIVATE_KEY` GHA secret. Never committed
- Pre-commit hook runs `gitleaks` (M1) to block accidental commits

## Supply chain

- pnpm with `--frozen-lockfile` in CI
- `pnpm audit --audit-level high` in CI; high/critical findings fail the build
- Renovate Bot for dependency PRs (M1)
- `pnpm config set side-effects-cache=false` and limited `onlyBuiltDependencies` allowlist — postinstall scripts are off by default
- Dependencies pinned to minor (`^x.y`) and reviewed when major bumps land

## Personal data (RU 152-ФЗ)

- Personal data processed: athlete first/last/middle name, DOB, gender, region, photo, coach name, federation card number, contact (phone/email/telegram for users)
- Storage: RU territory (reg.ru Moscow node, already in place)
- Consent: explicit, granular, captured at registration; consents themselves are audit-logged
- Subject rights: export ("download my data"), correction, deletion (GDPR-style "right to be forgotten" implemented even if 152-ФЗ stops short)
- Processor registration with РКН (Roskomnadzor) — **TODO legal team** before V2 GA
- Public results page: athletes can opt out of public listing (federation can additionally set `isPublicResultsClosed`)

## Module-isolation interaction (ADR-0003)

The "broken module doesn't break others" rule has principled exceptions:

- **Auth failure** → request is rejected. This is correct behavior, not a module failure
- **Audit-log write failure** for a sensitive action → the action itself fails. The system MUST NOT have privileged writes without an audit trail. Documented in `ADR-0005`
- **CSP/security-header middleware failure** → boot fails. We do not run a server without baseline headers

All other security primitives (rate limiter, anomaly detector, SSO providers) follow the standard isolation rule: their failure degrades that capability, not the whole system.

## Vulnerability disclosure

See `SECURITY.md` at repo root.

## Out-of-scope for V1 (planned)

- WAF / DDoS protection at L7 (currently relying on reg.ru's L4 + nginx; Cloudflare front M9 if traffic warrants)
- HSM-backed signing keys (Tauri updater key on maintainer's host is acceptable for V1 scale)
- SOC2 / ISO 27001 audit (V2+ international track)
- Penetration test — schedule one before public launch (M9)
