# Architecture

## Three clients, one domain

```
┌──────────────────────────────────────────────────────────────┐
│                     packages/domain                          │
│              Zod schemas, types, business rules              │
└──────────────────────────────────────────────────────────────┘
        ▲                    ▲                    ▲
        │                    │                    │
        │                    │                    │
┌───────┴────────┐  ┌────────┴────────┐  ┌────────┴────────┐
│   apps/web     │  │    apps/api     │  │  apps/desktop   │
│  React 19 SPA  │  │  Fastify + PG   │  │   Tauri 2 +     │
│  (browser)     │  │  + WebSockets   │  │  local SQLite   │
└────────────────┘  └─────────────────┘  └─────────────────┘
        │                    ▲                    │
        │                    │                    │
        └────── HTTP/WS ─────┴────── HTTP/WS ─────┘
                             ▲
                             │
                  ┌──────────┴──────────┐
                  │  packages/sync       │
                  │  event log replay    │
                  │  conflict resolution │
                  └──────────────────────┘
```

## Why browser-first

legacy reference system runs as a 1С thin client over the internet — when connection drops, secretaries lose work. Our V1 (legacy `streetlifting-os`) over-corrected and went desktop-only via Tauri, which fixed offline but lost the zero-install web experience federations need for online registration, public results, and broadcast.

V2 keeps both: web is the default; desktop is the tournament-day fallback that mirrors the server locally.

## Sync model

The desktop client owns a local SQLite mirror of the relevant scope (one competition at a time during operation). All mutations go through an **event log**:

1. User action → event written to local log → optimistic UI update
2. Background worker pushes pending events to the API over HTTPS
3. API assigns a server-side Lamport clock, persists to Postgres, broadcasts via WebSocket
4. Other connected clients (web, other desktops) receive the broadcast and replay

Conflict resolution is **per-aggregate, field-level last-writer-wins** (with origin device ID + Lamport clock as tiebreaker). Deletes are tombstones, never hard. Two secretaries editing the same nomination simultaneously will see each other's changes within ~1 second when both are online; offline edits reconcile on reconnect.

## Real-time / broadcast publisher

The same WebSocket channel used for sync also serves the **broadcast publisher** (V3 unlock from legacy memory): scoreboard, judge tablets, public viewer pages, and OBS overlays subscribe to `competition:{id}:scoreboard` / `:awards` / `:flight:{flightId}` topics. The publisher fans out attempt decisions, lift cards, and award announcements as they happen.

This replaces the awkward HTML-table "Информационные таблицы для трансляций" legacy reference system exposes — instead of static refresh, broadcast surfaces are first-class real-time consumers.

## Roles

Permissions are checked at the API and re-checked client-side for UX gating. Roles are scoped:

- **Federation-scoped**: `federation_admin`, `accountant`, `secretary` (default federation context)
- **Competition-scoped**: `head_judge`, `judge`, `scoreboard_operator`, `speaker`, `secretary` (override)
- **Self-scoped**: `athlete`, `viewer`

A user can hold multiple role assignments. The desktop client persists the user's role context locally so it can keep operating while the network is gone.

## Hosting

- API + Postgres → reg.ru server (Stdp C1-M2-D20, Moscow), already provisioned
- Web → static build, served from same nginx (or Cloudflare Pages later)
- Desktop binaries → GitHub Releases (Tauri updater pulls `latest.json` from this repo's releases)

## Module isolation (top principle)

Every module of the system must be independently failable. A break in one module — render error in a feature, throw in a plugin, corrupted sync events for one aggregate, dead Tauri plugin — must NOT affect the others.

This is the project's main architectural rule. See [ADR-0003](decisions/ADR-0003-modular-isolation.md) for the full contract. Concrete plumbing already in the skeleton:

- **Web** — every feature route mounts via `LazyModule` (per-feature lazy chunk + per-feature error boundary in `apps/web/src/lib/`). The shell, navigation, and other modules survive a crash in one.
- **API** — every feature is a `FeaturePlugin` registered via `loadPlugins()` (`apps/api/src/lib/load-plugins.ts`), each in its own try/catch. One broken plugin is logged and skipped; the rest of the API serves.
- **Sync** — per-aggregate queues with a dead-letter queue for poisoned events (M3).
- **Desktop** — Tauri plugin init is fault-tolerant; an unavailable plugin degrades the relevant UI surface, app still launches (M5).
- **Cross-cutting** — per-module logger tags, per-module health endpoints, env-var feature flags.

Features must NOT import from each other. Shared shapes go through `packages/domain`; shared UI goes through `packages/ui`. This rule binds even MVP code.

## Key non-goals (V1)

- Multi-region replication (RU jurisdiction, single Moscow node is enough)
- Mobile native apps (browser PWA covers tablets/phones)
- Powerlifting (scope is streetlifting + weighted calisthenics only — see project memory)
