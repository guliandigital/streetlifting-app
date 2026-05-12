# ADR-0001: Stack

**Status**: Accepted (2026-05-07)
**Decision-makers**: Ararat Gulyan + Claude

## Context

V1 (`streetlifting-os-legacy`) was Tauri-only desktop. The "boxed" form factor solved offline reliability on tournament day but blocked four important workflows: zero-install browser registration, federation portal, public results, and broadcast surfaces.

V2 must be browser-primary, with desktop as the offline tournament-day client. The same code should run in both. The product is a legacy reference system replacement, so the data model is heavy (federation directories, billing journals, audit trails, multi-role permissions, broadcast publisher).

## Decision

| Layer                         | Choice                                        |
| ----------------------------- | --------------------------------------------- |
| Frontend (web + desktop view) | React 19 + TypeScript + Vite                  |
| Routing                       | TanStack Router                               |
| Server state                  | TanStack Query                                |
| UI                            | Tailwind v4 + shadcn/ui                       |
| Local state                   | Zustand                                       |
| Validation                    | Zod (shared with backend)                     |
| Backend                       | Node 20 + Fastify + TypeScript                |
| ORM                           | Prisma                                        |
| DB                            | PostgreSQL 16 (already on reg.ru)             |
| Real-time                     | `@fastify/websocket`                          |
| Auth                          | `@fastify/jwt` + argon2                       |
| Background jobs               | BullMQ + Redis (added at M7 for Telegram bot) |
| Desktop wrapper               | Tauri 2                                       |
| Local DB (desktop offline)    | SQLite via `tauri-plugin-sql`                 |
| Monorepo                      | pnpm workspaces + Turborepo                   |

## Alternatives considered

- **1С:Предприятие** (legacy reference system's stack): rejected — proprietary, locks us into 1С licensing, dated UX
- **Next.js**: rejected — server components add complexity for what is effectively a SPA + API, and SSR has no value for an authenticated admin tool
- **Electron**: rejected — Tauri is smaller, faster, and we already have a working signed-update chain
- **Supabase / Firebase**: rejected — RU jurisdiction, ИП Гулян А. Г. legal entity, owned reg.ru server (per project legal memo)
- **Rust on the API (Axum)**: considered — rejected for V1 to favor Node ecosystem and shared TS types between API/UI; revisit if API becomes a bottleneck
- **Drizzle over Prisma**: considered — Prisma's migration tooling and Studio UI are more mature, retained for now

## Consequences

- Single language (TypeScript) from API to browser to desktop UI
- Shared `packages/domain` is the single source of truth for shapes and rules
- Zod validation runs in three places (server input, client form, sync replay) but the schema is written once
- Tauri 2's plugin-sql gives us SQLite on the desktop without Rust expertise
- Reusing the v1.4.1 Ed25519 pubkey means existing v1.x users can be migrated to V2 binaries via auto-update later (when V2 is feature-equivalent)
