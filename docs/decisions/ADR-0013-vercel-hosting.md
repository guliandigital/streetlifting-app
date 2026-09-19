# ADR-0013: Host web, API and ISF ID on Vercel

## Status

Accepted 2026-09-19. Supersedes the reg.ru / nginx / systemd deployment described
in earlier runbooks and the docker-compose local environment.

## Context

The first production deployment targeted a single reg.ru VPS: nginx serving the
SPA and proxying `/api`, two systemd services (API, ISF ID), a local Postgres, and
docker-compose (Postgres + Redis) for local development. It required SSH keys,
manual server provisioning, and a Docker Desktop dependency for every developer
machine. The owner already runs the federation sites (`streetlifting.pro`,
`streetlifting.ru`) on Vercel and asked to consolidate.

## Decision

Three Vercel projects in the `amobit` team, all linked to
`guliandigital/streetlifting-app` with a per-app root directory:

| Project                | Root          | Preset  | Domain                  |
| ---------------------- | ------------- | ------- | ----------------------- |
| `streetlifting-web`    | `apps/web`    | vite    | `streetlifting.app`     |
| `streetlifting-api`    | `apps/api`    | fastify | `api.streetlifting.app` |
| `streetlifting-isf-id` | `apps/isf-id` | fastify | `id.streetlifting.app`  |

- The SPA keeps calling `/api/*` on its own origin; `apps/web/vercel.json`
  rewrites that prefix to the API project. Bearer tokens, not cookies, carry the
  session, so no cross-site cookie configuration is needed.
- Postgres is **Neon** via the Vercel Marketplace: one database for the API and a
  separate one for ISF ID (ADR-0012 forbids sharing). The runtime uses the pooled
  connection string (`db.ts` appends `pgbouncer=true`); migrations run on the
  unpooled URL during production builds only (`scripts/vercel-build.mjs`).
- Uploaded files live in a **private Vercel Blob** store behind
  `apps/api/src/lib/storage.ts`; every download still goes through the API so
  route-level authorization is unchanged. Local development and tests use the
  `fs` driver.
- **WebSocket live updates are disabled on Vercel** (no upgrade support on Node
  functions). Operator, judge and scoreboard screens keep the 2-second HTTP
  polling that already existed as the fallback; the client stops reconnecting
  after three failed attempts. Self-hosted deployments can still enable the
  channel (`LIVE_UPDATES_WS`), so the Redis backplane code stays.
- ISF webhook outbox delivery, previously a `setInterval`, is additionally exposed
  as `GET /internal/cron/isf-outbox` guarded by `CRON_SECRET` and scheduled from
  `apps/api/vercel.json`.
- Rate-limit counters are per function instance. Auth routes keep their strict
  per-route limits; this is accepted for the pilot and revisited if abuse appears.

## Consequences

- No servers, SSH keys, nginx or systemd units in the repository; production
  deploys happen on push to `main`, previews on pull requests.
- Local development no longer needs Docker: `pnpm dev` expects `DATABASE_URL`
  (a Neon development branch, pulled with `vercel env pull`).
- Request bodies are capped at 4.5 MB by the platform. Base64 upload payloads
  must stay under that, so attachment limits are 3 MiB of file content.
- Cold starts add latency to the first request per instance; Fluid Compute keeps
  instances warm under sustained load.
- The browser CSP is now set by `apps/web/vercel.json` (previously missing in
  production); inline scripts were removed from `index.html` to allow
  `script-src 'self'`.
