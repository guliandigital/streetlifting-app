# Streetlifting App

Competition platform for streetlifting and weighted calisthenics. Browser-first, with an offline-capable desktop client for tournament day. PowerTable replacement, V2.

> Successor to [streetlifting-os-legacy](https://github.com/guliandigital/streetlifting-os-legacy) (Tauri-only desktop, v1.x). The legacy app remains in maintenance/hotfix mode while V2 reaches feature parity.

## Stack

- **Frontend** — React 19, TypeScript, Vite, TanStack Router/Query, Tailwind v4, shadcn/ui
- **Backend** — Node 20, Fastify, Prisma, PostgreSQL 16, WebSockets
- **Desktop** — Tauri 2 wrapping the same web app, with local SQLite + sync engine for offline-first competition-day operation
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
  domain-model.md         — entities and fields (PowerTable parity)
  roadmap-v2.md           — phased plan to feature parity
  decisions/              — architecture decision records
  research/               — competitive analysis, screen maps
```

## Getting started

```bash
pnpm install
pnpm dev            # web + api in parallel
pnpm dev --filter=@streetlifting/web
pnpm build
```

## License

Proprietary — © 2026 ИП Гулян А. Г. (RU). License file pending.
