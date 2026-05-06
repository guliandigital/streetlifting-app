# V2 Roadmap

Target: full PowerTable functional parity, modern UX, browser-primary with offline-capable desktop. Scope decided 2026-05-07: option **B** (everything before first release, ~14–18 weeks).

## Milestones

## Cross-milestone rule: Module isolation

Every milestone must include an **Isolation check**: prove that breaking the new module (force a throw in its boundary, kill its plugin) does NOT affect any previously shipped module. This is the top architectural principle — see [ADR-0003](decisions/ADR-0003-modular-isolation.md).

Features must not import from each other. Shared shapes live in `packages/domain`; shared UI in `packages/ui`. The isolation primitives (`LazyModule`, `loadPlugins`) are already in the skeleton.

### M0 — Skeleton (Day 0–3) ← DONE 2026-05-07
- [x] Monorepo: pnpm + Turborepo, apps/web · apps/api · apps/desktop, packages/domain · ui · sync
- [x] React 19 + Vite + Tailwind v4 stub
- [x] Fastify + Postgres stub with `/health`
- [x] Tauri 2 wrapper, auto-update endpoint pointed at this repo, signing key reused from v1.4.1 (`AE2C…8968`)
- [x] Domain Zod schemas for the 14 core entities
- [x] Module-isolation primitives: `LazyModule` + `ModuleErrorBoundary` (web), `loadPlugins` (api)
- [x] First isolation-checked feature stub: `_health`
- [x] Security baseline (ADR-0004): helmet+strict CSP, CORS allowlist, error handler, audit primitive
- [x] Logging+audit (ADR-0005): pino with PII redact list, request-context UUIDv7, `audit.record` API
- [x] Brand: palette + logo pack curated subset wired (favicons, app header symbol, Tauri icons, Tailwind tokens)
- [x] Money in integer kopecks + per-competition IANA timezone (ADR-0006)
- [x] ISF v5.1 reference presets ported from V1 with M5/M6 70+→1.150 split preserved
- [x] ISF absolute-coefficient calculation ported from V1
- [x] New domain entities: Record, PlateSet, VeteranCoefficient, Consent, Attachment
- [x] Tooling: ESLint flat config (cross-feature import ban + no-console for web), Prettier, lefthook (gitleaks + prettier + eslint pre-commit, commitlint, typecheck+test pre-push), commitlint, vitest configs, .browserslistrc, docker-compose for Postgres+Redis, PR template, CONTRIBUTING.md

### M1 — Foundations (Week 1–2)
- [ ] Prisma schema generated from domain types; migrations against Postgres 16 on reg.ru
- [ ] Auth: JWT + refresh, argon2 hashing, role assignments
- [ ] Web shell: TanStack Router with role-aware route guards, login/logout, layout chrome
- [ ] shadcn/ui base components installed: Button, Input, Select, Dialog, Sheet, Table, Toast, DataTable
- [ ] Russian + English i18n scaffolding (i18next), brand-neutral color tokens
- [ ] CI: typecheck + test on push to main + PRs

### M2 — Core directories (Week 3–4)
- [ ] Federations: CRUD, settings page (contact info, security key, accountant/cashier)
- [ ] Athletes: list with virtualized table, search, profile page, photo upload
- [ ] Disciplines catalog: editable in admin, locked per competition
- [ ] Judges: directory + per-competition assignments

### M3 — Competitions + nominations (Week 5–7)
- [ ] Competition wizard: create draft → set divisions, classes, disciplines, fees
- [ ] Online registration: public form per federation page (athlete self-registers, picks disciplines + classes, pays)
- [ ] Secretary nomination grid: filter, bulk edit, mandate check, weigh-in entry
- [ ] Body weight at weigh-in + automatic class assignment
- [ ] Entry number / lot drawing

### M4 — Flights, groups, platforms (Week 8)
- [ ] "Распределение по потокам и группам" page: drag-drop assignment, automatic ordering
- [ ] Per-platform timetable

### M5 — Tournament day operations (Week 9–11) — **the offline-critical part**
- [ ] Sync engine in `packages/sync`: local SQLite, event log, online/offline indicator
- [ ] Operator scoreboard page: current lifter card, attempt entry, weight changes
- [ ] Judge tablet UI (PWA-installable): three-button white/red, head-judge final
- [ ] Speaker view: announcements queue, athlete bios
- [ ] Public broadcast page: live results, current attempt, leaderboard
- [ ] OBS overlay (HTML page with transparent background)

### M6 — Reports, awards, printables (Week 12–13)
- [ ] Awards ceremony page: place computation, tie-break, deck
- [ ] Certificate (грамота) PDF generation, template per federation
- [ ] Standard reports: protocol, technical secretary report, weight class results, federation summary
- [ ] CSV / XLSX exports

### M7 — Federation portal (Week 14–15)
- [ ] Federation home: receipts/writeoffs ledger, balance, regional comparison chart
- [ ] Telegram bot: federation registration codes, new-registration notifications
- [ ] Support tickets: federation ↔ platform admin
- [ ] Public results page (gated by `isPublicResultsClosed`)

### M8 — Desktop binary + auto-update (Week 16)
- [ ] Tauri build pipeline (Win MSI/NSIS, macOS DMG, Linux AppImage/DEB)
- [ ] Code signing (Windows EV cert decision pending — Schema Б)
- [ ] First V2 release: `streetlifting-app-v2.0.0`, `latest.json` published
- [ ] Final v1.x release on legacy repo: bumps version banner, points users to V2 install link

### M9 — Hardening + pilot meet (Week 17–18)
- [ ] Load test broadcast publisher with simulated 200 concurrent viewers
- [ ] Run a pilot tournament with one friendly federation, gather feedback
- [ ] Hotfix cycle
- [ ] Public launch announcement

## What we explicitly defer

- Powerlifting disciplines (scope locked to streetlifting + weighted calisthenics)
- International ООО track / EUSF integration (V2 = RU-first, ИП track per legal memory)
- Mobile native apps
- Wearable / EMG integrations

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Sync engine more complex than estimated | M5 is the single biggest milestone; budget extra week if event log gets messy |
| Pilot federations resist switching from PowerTable | Run M9 pilot with a friendly federation we already know; PowerTable parity is non-negotiable |
| Tauri auto-update key rotation breaks v1.x users | Re-using v1.4.1 pubkey in V2 (`AE2C…8968`) — old binaries already trust this signer |
| reg.ru server can't handle broadcast fanout | Profile early in M5; if needed, move WS to Cloudflare or self-host in front of reg.ru |
| Russian regulatory changes (data localization) | Already on RU infra; ИП Гулян А. Г. is RU resident; aligned with project legal memo |
