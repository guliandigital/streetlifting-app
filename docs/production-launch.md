# Production launch runbook

This runbook is for the web-first launch path. Desktop/offline, mobile clients, server-side certificate PDFs, and awards automation stay deferred until the browser workflow is stable in a real pilot.

Hosting, environment variables, domains and the per-release procedure live in
[vercel-deployment.md](vercel-deployment.md). This document covers scope, seeding, smoke checks and
the manual QA flow.

## Pilot scope

Included in the first online pilot:

- authenticated web secretariat;
- federations, competitions, athletes, judges, disciplines, and references;
- default competition setup, nominations, mandate, weigh-in, payments, draw, flights/groups;
- platform operator screen, judge tablet screen, scoreboard/hall screen;
- protocol/accounting CSV and XLSX exports;
- print-friendly protocol page for browser `Print / Save as PDF`.

Explicitly not included in the first pilot:

- online payment provider;
- server-side PDF certificates, federation-specific certificate templates, awards ceremony deck;
- desktop/offline Tauri, local SQLite, sync event log, auto-update publishing.

Operational limitations:

- the first pilot is online-only. For tournament day, keep a manual paper/CSV fallback until offline
  sync is shipped;
- tournament screens refresh by HTTP polling every 2 seconds (no WebSocket on Vercel).

## One-time provisioning

Root user and reference data are seeded from a workstation against the production **unpooled**
database URL (copy it from the Neon integration in Vercel; never store it in a file):

```bash
DATABASE_URL='<DATABASE_URL_UNPOOLED>' \
ROOT_EMAIL=<email> ROOT_PASSWORD=<password> ROOT_DISPLAY_NAME='Platform Admin' \
pnpm --filter=@streetlifting/api seed:launch
```

Re-running `seed:root` rotates that account password. Reference seeds are idempotent.

Federation-scoped login, when a federation account should open its workspace directly:

```bash
DATABASE_URL='<DATABASE_URL_UNPOOLED>' \
FEDERATION_CODE=<federation-code> \
FEDERATION_USER_EMAIL=<federation-email> \
FEDERATION_USER_PASSWORD=<temporary-password> \
FEDERATION_USER_DISPLAY_NAME=<display-name> \
pnpm --filter=@streetlifting/api seed:federation-user
```

`FEDERATION_USER_ROLE` accepts `federation_admin` (default), `secretary`, or `accountant`.
Re-running rotates that user's password and preserves existing non-revoked scoped roles.

## Release

1. `pnpm release:check` locally or green CI on the pull request (lint, typecheck, tests, fresh-database
   migrations, browser e2e).
2. Merge to `main`. Vercel builds the three projects; the API and ISF ID builds apply pending
   migrations before compiling. A failed migration fails the build and leaves the previous deployment
   live.
3. Smoke checks:

   ```bash
   curl -fsS https://streetlifting.app/api/health
   curl -fsS https://streetlifting.app/api/health/competitions
   curl -fsS https://streetlifting.app/api/health/competition-ops
   curl -fsS https://id.streetlifting.app/health
   curl -fsSI https://streetlifting.app/sw.js | grep -Ei 'content-type|cache-control'
   ISF_META_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' https://streetlifting.app/api/isf/v1/meta)
   test "$ISF_META_STATUS" = "401"
   ```

4. Authenticated pilot smoke against production:

   ```bash
   PILOT_SMOKE_API_URL=https://streetlifting.app/api \
   PILOT_SMOKE_EMAIL=<root-or-secretary-email> \
   PILOT_SMOKE_PASSWORD=<password> \
   pnpm release:smoke
   ```

   The smoke creates an isolated federation/competition/athlete/nomination, checks duplicate
   nomination rejection, draw, weigh-in/payment, component attempts, scoreboard, protocol CSV, and
   accounting CSV.

5. Authenticated ISF smoke — prefer the GitHub Actions **ISF production smoke** workflow, which reads
   `ISF_SMOKE_SERVICE_TOKEN` from the `production` environment secret. Locally:

   ```bash
   ISF_SMOKE_API_URL=https://streetlifting.app/api \
   ISF_SMOKE_SERVICE_TOKEN=<service-client-token> \
   ISF_SMOKE_TENANT=ru \
   pnpm release:smoke:isf
   ```

## Manual web flow

1. Log in as the seeded root user.
2. Create a federation.
3. Create a competition.
4. Open competition operations and apply baseline setup.
5. Create an athlete and a nomination.
6. In `Operations → Nominations`, create the nomination, then draw entry numbers.
7. In `Operations → Mandate / weigh-in`, set payment status, paid amount, mandate, bodyweight, and actual weight class.
8. In `Operations → Flights`, run auto-plan and confirm that every active nomination has a flight and group.
9. In `Operations → Attempts`, save at least one component attempt with `good_lift` and one with `no_lift`.
10. Open the scoreboard hall screen and confirm places, best result, score, and statuses refresh.
11. Open the operator screen and confirm the current athlete card, timer, attempt entry, and queue.
12. Open the judge tablet screen and confirm good/no/withdraw buttons are visible for the active nomination.
13. Open the print-friendly protocol and use browser print preview for PDF output.
14. Export protocol CSV/XLSX and accounting CSV/XLSX.

## Post-login E2E QA flow

1. Create the Playwright auth state automatically, when QA credentials are available:

   ```bash
   E2E_API_URL=https://streetlifting.app/api \
   E2E_WEB_URL=https://streetlifting.app \
   E2E_EMAIL=<root-or-secretary-email> \
   E2E_PASSWORD=<password> \
   pnpm --filter=@streetlifting/web e2e:auth
   ```

   Or save it after a manual browser login:

   ```bash
   E2E_WEB_URL=https://streetlifting.app pnpm --filter=@streetlifting/web e2e:auth:manual
   ```

2. Run the browser QA flow with the saved `apps/web/e2e/.auth/secretary.json` state:

   ```bash
   E2E_API_URL=https://streetlifting.app/api \
   E2E_WEB_URL=https://streetlifting.app \
   E2E_SKIP_WEB_SERVER=1 \
   pnpm e2e:web
   ```

## Rollback

- Vercel → Deployments → _Promote to Production_ on the previous deployment restores code
  instantly.
- Code rollback is safe if the release applied no migration. After a migration, rollback must follow
  Prisma migration policy for the exact migration set. Do not manually edit production tables.

## Post-pilot work

Do not block the first web pilot on these items:

- server-side PDF certificate rendering;
- federation-specific certificate and awards templates;
- awards ceremony automation;
- offline desktop/Tauri with SQLite and sync;
- installer signing and auto-update publishing for V2 desktop builds.
