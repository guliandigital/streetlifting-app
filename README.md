# Streetlifting App

Competition platform for streetlifting and weighted calisthenics. V2 is web-first: the production release is the browser client + API + Postgres, hosted on Vercel. An offline-capable desktop client remains in the architecture but is deferred until the web workflow is stable in real tournaments.

> Successor to [streetlifting-os-legacy](https://github.com/guliandigital/streetlifting-os-legacy) (Tauri-only desktop, v1.x). The legacy app remains in maintenance/hotfix mode while V2 reaches feature parity.

## Stack

- **Frontend** — React 19, TypeScript, Vite, TanStack Router/Query, Tailwind v4, shadcn/ui
- **Backend** — Node 20, Fastify, Prisma, PostgreSQL 16 (Neon)
- **Identity** — `apps/isf-id`, an isolated RSA/JWKS issuer for ISF ID single sign-on (ADR-0012)
- **Hosting** — Vercel: static web, Fastify functions, Neon Postgres, private Blob storage (ADR-0013)
- **Domain** — Shared Zod schemas in `packages/domain` (single source of truth across web, api, desktop)
- **Monorepo** — pnpm workspaces + Turborepo

## Layout

```
apps/
  web        — primary browser client (SPA)
  api        — Fastify server + Postgres
  isf-id     — ISF ID identity issuer (separate database, separate deployment)
  desktop    — Tauri 2 shell; offline/sync deferred (see roadmap P3)
packages/
  domain     — Zod schemas, types, domain rules
  ui         — shared shadcn/ui components
  sync       — event-log prototype for the deferred offline desktop
docs/
  launch-readiness-plan.md — current plan to production
  vercel-deployment.md     — hosting setup and release procedure
  production-launch.md     — pilot scope, seeding, smoke checks
  domain-model.md          — entities and fields (legacy reference system parity)
  roadmap-v2.md            — phased plan to feature parity
  decisions/               — architecture decision records
```

## Getting started

```bash
pnpm install
vercel link --cwd apps/api                                            # once
vercel env pull apps/api/.env --environment=development --cwd apps/api
pnpm dev            # builds domain, migrates + seeds the dev database, runs API + web
pnpm build
```

No Docker is required: local development uses a Neon development branch. If you prefer a local
Postgres, put its connection string into `apps/api/.env` as `DATABASE_URL`.

The dev launcher opens the app at `http://127.0.0.1:1420/login` and the API health check at
`http://127.0.0.1:3000/health`. Local root credentials are read from `apps/api/.env`; missing
local-only defaults (JWT secret, root login) are generated on first run.

Quality gates (also enforced in CI):

```bash
pnpm lint
pnpm exec turbo run typecheck test
pnpm e2e:web
```

## Production

Deploys happen on push to `main` through the linked Vercel projects. Setup, environment variables,
domains and the release checklist are in [docs/vercel-deployment.md](docs/vercel-deployment.md).

## License

Proprietary — © 2026 ИП Гулян А. Г. (RU). See [LICENSE](LICENSE).
