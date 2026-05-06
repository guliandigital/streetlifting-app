# Contributing to Streetlifting App

## Prerequisites

- **Node 20** (use `nvm use` — `.nvmrc` pins it)
- **pnpm 9+** (`corepack enable && corepack prepare pnpm@9 --activate`)
- **Docker Desktop** (for local Postgres + Redis via `docker compose`)
- **gitleaks** (pre-commit secret scanner used by lefthook):
  - Windows: `winget install gitleaks` or `scoop install gitleaks`
  - macOS: `brew install gitleaks`
  - Linux: see https://github.com/gitleaks/gitleaks#installing
- **Rust + Tauri prerequisites** (only if you'll touch `apps/desktop` — see https://v2.tauri.app/start/prerequisites/)

## First-time setup

```bash
git clone https://github.com/guliandigital/streetlifting-app.git
cd streetlifting-app

pnpm install         # also installs lefthook git hooks via `prepare`
docker compose up -d # Postgres + Redis on localhost
cp apps/api/.env.example apps/api/.env

pnpm dev             # web → http://localhost:1420, api → http://localhost:3000/health
```

## Day-to-day commands

```bash
pnpm dev                          # all apps in parallel
pnpm dev --filter=@streetlifting/web
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm format                       # rewrite formatting
pnpm format:check                 # CI-style check
```

## Workflow

1. Branch off `main`. Naming: `feat/<short>`, `fix/<short>`, `chore/<short>`.
2. Commit using **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`, `test:`, `build:`, `ci:`). `commitlint` enforces this on every commit.
3. Pre-commit hooks (`lefthook`) run automatically: `gitleaks` (no secrets), `prettier --check`, `eslint`. Pre-push runs `typecheck` + `test`.
4. Open a PR to `main`. The PR template lists the architecture gates that must pass — fill them in honestly.
5. CI must be green. Squash-merge.

## Adding a feature (web)

1. Create `apps/web/src/features/<name>/index.tsx` exporting a default React component.
2. Mount it via `LazyModule` in the router (`apps/web/src/App.tsx` or feature-router at M1+).
3. Wrap it in its own `ModuleErrorBoundary` (the `LazyModule` helper already does this).
4. Use `moduleLogger('<name>')` for any logging — never raw `console.*`.
5. Tests next to the source: `<name>.test.tsx`.

See [ADR-0003](docs/decisions/ADR-0003-modular-isolation.md) for the why.

## Adding a feature (api)

1. Create `apps/api/src/plugins/<name>.ts` exporting a `FeaturePlugin`.
2. Append it to the `features` array in `apps/api/src/index.ts`.
3. Use `moduleLogger('<name>')` and `audit.record(...)` for sensitive writes.
4. Validate inputs with Zod schemas from `packages/domain` using `.strict()`.
5. Add a `/health/<name>` endpoint.
6. Add tests under `apps/api/src/plugins/<name>.test.ts`.

See [ADR-0003](docs/decisions/ADR-0003-modular-isolation.md), [ADR-0004](docs/decisions/ADR-0004-security-baseline.md), [ADR-0005](docs/decisions/ADR-0005-logging-and-audit.md).

## Domain changes

The single source of truth is `packages/domain`. If a shape is needed by both apps, it goes there. Do not redefine types in `apps/*`.

- Money: integer kopecks (`amountKopecks: number`). See [ADR-0006](docs/decisions/ADR-0006-money-and-timezone.md).
- Time: UTC ISO 8601 in storage, rendered with the competition's `timezone` (IANA TZ).
- IDs: branded types via `packages/domain/src/ids.ts`. Do not pass plain strings.

## Module isolation rule

**Features must NOT import from each other.** Shared shapes go through `packages/domain`; shared UI through `packages/ui`. ESLint enforces this for both web features and API plugins. If you need cross-feature data, fetch it independently through the domain API.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Do not open public GitHub issues for security findings.
