# API plugins

Each file is a self-contained feature plugin that the bootstrap loads via
`loadPlugins()` (see `../lib/load-plugins.ts`). A failure in one does NOT
take the API down — the bootstrap logs the error and continues.

## Rules (ADR-0003)

- One feature = one plugin file
- Plugins import from `@streetlifting/domain` and shared infra only — NEVER
  from another plugin
- Each plugin owns its `errorHandler` (call `app.setErrorHandler` inside if
  you need scoped handling)
- Each plugin exposes a `/health/<feature>` endpoint
- Schema validation via `fastify-type-provider-zod` against `@streetlifting/domain`

## Layout convention

```
plugins/
  <feature>.ts     ← exports a FeaturePlugin
  <feature>/       ← if the feature needs multiple files
    index.ts       ← exports the FeaturePlugin
    routes.ts
    service.ts
    schemas.ts
```
