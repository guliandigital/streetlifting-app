# Vercel deployment

Hosting decision: [ADR-0013](decisions/ADR-0013-vercel-hosting.md). Three projects in the
`amobit` Vercel team, all linked to `guliandigital/streetlifting-app`; production deploys on
push to `main`, previews on pull requests.

| Project                | Root directory | Framework preset | Production domain                            |
| ---------------------- | -------------- | ---------------- | -------------------------------------------- |
| `streetlifting-web`    | `apps/web`     | Vite             | `streetlifting.app`, `www.streetlifting.app` |
| `streetlifting-api`    | `apps/api`     | Fastify          | `api.streetlifting.app`                      |
| `streetlifting-isf-id` | `apps/isf-id`  | Fastify          | `id.streetlifting.app`                       |

Each app has a `vercel-build` script that Vercel runs instead of `build`:

- `apps/web`: builds `packages/domain`, then `tsc -b && vite build`.
- `apps/api`, `apps/isf-id`: `scripts/vercel-build.mjs` — Prisma generate, `prisma migrate deploy`
  (production builds only, unpooled URL), `tsc`. A failed migration fails the build and the previous
  deployment stays live.

## One-time setup

### 1. Databases (Neon via Vercel Marketplace)

In the Vercel dashboard → Storage → Create → Neon:

1. `streetlifting-db` → connect to **streetlifting-api** (all environments). Neon adds
   `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`.
2. `isf-id-db` → connect to **streetlifting-isf-id** only. ISF ID must never share the API database
   (ADR-0012).

Development environment variables should point at a Neon **development branch**, not production.

### 2. Blob store

Storage → Create → Blob, access **private**, name `streetlifting-uploads`, connect to
**streetlifting-api**. This sets `BLOB_READ_WRITE_TOKEN`; the API switches to the `vercel-blob`
storage driver automatically.

### 3. Environment variables

`streetlifting-api` (production + preview unless noted):

| Key                                                  | Value                                                                                                                |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                           | `production`                                                                                                         |
| `JWT_SECRET`                                         | `openssl rand -base64 48` (sensitive)                                                                                |
| `CORS_ORIGIN`                                        | `https://streetlifting.app,https://www.streetlifting.app`                                                            |
| `CRON_SECRET`                                        | `openssl rand -base64 32` (sensitive) — Vercel sends it to cron targets                                              |
| `LOG_LEVEL`                                          | `info`                                                                                                               |
| `RATE_LIMIT_MAX`                                     | `120`                                                                                                                |
| `SENTRY_DSN`                                         | optional                                                                                                             |
| `SMTP_*` / `MAILER_*`                                | as in `apps/api/.env.example`                                                                                        |
| `ISF_ID_ENABLED`, `ISF_ID_ISSUER`, `ISF_ID_JWKS_URL` | `true`, `https://id.streetlifting.app`, `https://id.streetlifting.app/.well-known/jwks.json` once ISF ID is verified |
| `ISF_WEBHOOK_URL`, `ISF_WEBHOOK_SECRET`              | when the ISF downstream is configured                                                                                |
| `ROOT_EMAIL`, `ROOT_PASSWORD`                        | **not** stored in Vercel; used once from a workstation (see seeding)                                                 |

`streetlifting-isf-id`: everything from `apps/isf-id/.env.example` except the database keys, which
Neon provides. `ISF_ID_PRIVATE_KEY` holds the RSA PEM as a sensitive variable
(`ISF_ID_PRIVATE_KEY_PATH` is unused on Vercel).

`streetlifting-web`: `VITE_SENTRY_DSN` (optional). The API origin is fixed in `apps/web/vercel.json`.

### 4. Domains

Add in each project (Settings → Domains) and point DNS at reg.ru to Vercel:

| Domain                  | Project              | DNS                          |
| ----------------------- | -------------------- | ---------------------------- |
| `streetlifting.app`     | streetlifting-web    | `A 76.76.21.21`              |
| `www.streetlifting.app` | streetlifting-web    | `CNAME cname.vercel-dns.com` |
| `api.streetlifting.app` | streetlifting-api    | `CNAME cname.vercel-dns.com` |
| `id.streetlifting.app`  | streetlifting-isf-id | `CNAME cname.vercel-dns.com` |

Vercel issues TLS certificates automatically once DNS resolves. The `.vercel.app` URLs are behind
Vercel Authentication (team default) and are not used by the SPA.

### 5. Seed reference data and the root user

From a workstation with the production **unpooled** URL (never stored in a file):

```bash
DATABASE_URL='<DATABASE_URL_UNPOOLED>' ROOT_EMAIL=... ROOT_PASSWORD=... \
  pnpm --filter=@streetlifting/api seed:launch
```

`seed:root` rotates the root password on every run. `seed:federation-user` works the same way
(see `docs/production-launch.md`).

## Every release

1. Merge to `main`. Vercel builds all three projects; the API and ISF ID builds apply pending
   migrations.
2. Smoke:

   ```bash
   curl -fsS https://streetlifting.app/api/health
   curl -fsS https://streetlifting.app/api/health/competitions
   curl -fsS https://streetlifting.app/api/health/competition-ops
   curl -fsS https://id.streetlifting.app/health
   ```

3. Run the GitHub Actions **ISF production smoke** workflow (authenticated ISF export checks).
4. Rollback: Vercel → Deployments → _Promote to Production_ on the previous deployment. Code
   rollback is safe only if the release did not apply a migration; otherwise follow the Prisma
   migration policy in `docs/production-launch.md`.

## Local development

```bash
vercel link --cwd apps/api            # once: pick amobit / streetlifting-api
vercel env pull apps/api/.env --environment=development --cwd apps/api
pnpm dev
```

`pnpm dev` builds the domain package, generates the Prisma client, applies migrations to the
development branch, seeds reference data, then starts API (`:3000`) and web (`:1420`). No Docker.
Uploads use the `fs` driver under `apps/api/storage/` unless `BLOB_READ_WRITE_TOKEN` is set.

## Platform limits to keep in mind

- Request body ≤ 4.5 MB → attachment content ≤ 3 MiB (base64 overhead).
- No WebSocket upgrades on Node functions → live updates use HTTP polling (2 s).
- Rate-limit counters are per function instance.
- Function timeout defaults to 300 s on Fluid Compute; exports/reports are well under that.
