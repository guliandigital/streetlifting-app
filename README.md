# Streetlifting App

Competition platform for streetlifting and weighted calisthenics. V2 is web-first: the first production release targets the browser client + API + Postgres. Offline-capable desktop remains in the architecture, but it is deferred until the web workflow is stable.

> Successor to [streetlifting-os-legacy](https://github.com/guliandigital/streetlifting-os-legacy) (Tauri-only desktop, v1.x). The legacy app remains in maintenance/hotfix mode while V2 reaches feature parity.

## Stack

- **Frontend** — React 19, TypeScript, Vite, TanStack Router/Query, Tailwind v4, shadcn/ui
- **Backend** — Node 20, Fastify, Prisma, PostgreSQL 16, WebSockets
- **Desktop** — Tauri 2 wrapper planned after the web launch, with local SQLite + sync engine for offline-first competition-day operation
- **Domain** — Shared Zod schemas in `packages/domain` (single source of truth across web, api, desktop)
- **Monorepo** — pnpm workspaces + Turborepo

## Layout

```
apps/
  web        — primary browser client (SPA)
  api        — Fastify server + Postgres
  desktop    — Tauri 2 wrapper, offline-first
packages/
  domain     — Zod schemas, types, domain rules
  ui         — shared shadcn/ui components
  sync       — event log + conflict resolution for offline desktop
docs/
  domain-model.md         — entities and fields (legacy reference system parity)
  roadmap-v2.md           — phased plan to feature parity
  decisions/              — architecture decision records
  research/               — competitive analysis, screen maps
```

## Getting started

```bash
pnpm install
pnpm dev            # starts Docker Desktop/compose, prepares DB, runs API + web
pnpm dev --filter=@streetlifting/web
pnpm build          # web-first build: API + web
```

On Windows, use the same command from PowerShell:

```powershell
cd C:\PROJECTS\streetlifting-app
pnpm dev
```

The dev launcher opens the app at `http://127.0.0.1:1420/login` and the API
health check at `http://127.0.0.1:3000/health`. Local root credentials are read
from `apps/api/.env`; if the file is missing, the launcher creates it from
`apps/api/.env.example` and fills local-only defaults.

Local Docker ports default to `55432` for Postgres and `56379` for Redis to avoid
conflicts with other projects. Override them with `STREETLIFTING_POSTGRES_PORT`
and `STREETLIFTING_REDIS_PORT` if needed.

Desktop/Tauri builds are explicit post-web-launch work and require the Rust/Cargo
toolchain:

```bash
pnpm --filter=@streetlifting/desktop build
```

## Production launch

Use the web-first production runbook in [docs/production-launch.md](docs/production-launch.md).
reg.ru deployment setup is documented in [docs/reg-ru-deployment.md](docs/reg-ru-deployment.md).

## License

Proprietary — © 2026 ИП Гулян А. Г. (RU). License file pending.
