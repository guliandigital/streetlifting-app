# ADR-0003: Modular failure isolation

**Status**: Accepted (2026-05-07)
**Decision-makers**: Ararat Gulyan + Claude
**Stated as**: the *main* architectural principle ("главный принцип")

## Decision

A break in one module must NOT affect the others. This applies across every layer of the system and trumps brevity, performance micro-optimizations, and stylistic preferences when they conflict.

## What "module" means here

Each of these is a module that must be independently failable:

- **Frontend feature** — `competitions`, `athletes`, `judging`, `scoreboard`, `awards`, `federation-portal`, ...
- **Backend feature** — same boundaries, exposed as Fastify plugins
- **Sync aggregate** — events for `nominations` are isolated from events for `athletes`
- **Desktop subsystem** — auto-updater, local SQL, filesystem access, broadcast subscriber

## Concrete rules

### Frontend (`apps/web`)

1. **Every feature route is wrapped in its own React error boundary.** A render error inside `/competitions/:id/judging` shows a fallback in that view; the rest of the shell (header, nav, other tabs) keeps working.
2. **Features are lazy-loaded.** A chunk-load failure for one feature shows a "module unavailable, try again" fallback. The app does not blank.
3. **Features own their state.** No cross-feature mutable shared state beyond `auth/user`. If two features need the same data, they each query it through `packages/domain` types — they do NOT import from each other.
4. **No "barrel of features" import.** `src/main.tsx` does not eagerly import every feature. Routes are registered through a per-feature module that the router discovers.

### Backend (`apps/api`)

1. **One Fastify plugin per feature.** Files like `src/plugins/competitions.ts`, `src/plugins/judging.ts`, registered independently.
2. **Plugin registration is wrapped in try/catch in the boot sequence.** If `judging` fails to register, the boot logs an error and continues — `/competitions/...` still serves.
3. **Per-route error handlers.** A buggy handler returns 500 for that route only. No global throw bubbles up to take down the worker.
4. **Per-feature health endpoints.** `/health/db`, `/health/sync`, `/health/broadcast` — each independently tells you what's working.

### Sync (`packages/sync`)

1. **Per-aggregate sync queues.** Corrupted events for `nominations` do NOT block sync for `athletes` or `judges`.
2. **Dead-letter queue.** Events that fail to apply 3 times are moved to DLQ for manual review. No infinite retry loops that mask bugs.
3. **Replay isolation.** Aggregate replay is sandboxed — an exception during replay of one aggregate doesn't corrupt others.

### Desktop (`apps/desktop`)

1. **Tauri plugin init is fault-tolerant.** If `tauri-plugin-updater` fails to init (e.g., signing key missing), the app starts without auto-update and shows a banner. It does NOT refuse to launch.
2. **Local DB migration failures degrade gracefully.** A failed migration freezes that aggregate's table to read-only and surfaces the error — it does not brick the whole app.
3. **Network failure is invisible to features.** Sync engine queues; features keep using local data.

### Cross-cutting

1. **Per-module logger tag.** Every log line carries the module that emitted it.
2. **Feature flags.** `FEATURE_BROADCAST=false` env var disables a module without redeploy.
3. **No shared mutables across feature boundaries.** Period.

## Anti-patterns this rules out

- A `src/store/index.ts` that exports state from every feature combined.
- A backend `src/index.ts` with 200 lines of `app.get(...)` for every route in one file.
- A migration system where one bad SQL kills the boot.
- A WebSocket fan-out that throws if any subscriber serializer is broken.
- An error boundary at only the app root (covers everything → useless for isolation).

## Trade-offs

This costs lines of code. Per-feature error boundaries, per-feature plugins, per-aggregate sync queues — they all add structure that a 1-page MVP wouldn't have.

Accepted because:
- PowerTable parity means many features. A monolithic break in one would degrade the whole product.
- Tournament day is unforgiving. Operators can't restart the whole app to recover the awards module.
- Multi-role clients amplify the cost of failure: judge tablet crashing because of a scoreboard bug is unacceptable.

## Verification

Each milestone in `roadmap-v2.md` includes a "**Isolation check**" item: prove that breaking the new module (kill its plugin, throw in its boundary) does not affect any previously-shipped module.
