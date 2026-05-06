# Features

Each subdirectory here is a self-contained feature module. The top-level router
discovers them and mounts each behind a `LazyModule` (per-module error boundary
+ lazy chunk) — see ADR-0003.

## Rules

- A feature exports exactly one default React component (its root view) and
  optionally a route descriptor.
- Features may import from `@streetlifting/domain`, `@streetlifting/ui`,
  `apps/web/src/lib/*`, and shared infra (auth, query client). They MUST NOT
  import from another feature.
- Features own their own queries, mutations, and local state. If two features
  legitimately need the same shape, push the shape into `@streetlifting/domain`
  and each fetches it independently.
- Features may have their own `tests/` folder.

## Layout convention

```
features/<name>/
  index.tsx        ← default export, mounted root
  routes.ts        ← route descriptor consumed by the router (path, role, label)
  api.ts           ← TanStack Query hooks for this feature
  components/      ← feature-internal components
  state.ts         ← feature-internal Zustand store, if needed
  tests/
```

## Bootstrap feature: `_health`

`_health` is a deliberately minimal feature used to verify the isolation
plumbing works end-to-end before any real feature lands.
