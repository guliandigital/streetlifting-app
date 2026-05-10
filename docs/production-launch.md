# Production launch runbook

This runbook is for the web-first launch path. Desktop/offline, mobile clients, server-side certificate PDFs, and awards automation stay deferred until the browser workflow is stable in a real pilot.

## Pilot scope

Included in the first online pilot:

- authenticated web secretariat;
- federations, competitions, athletes, judges, disciplines, and references;
- default competition setup, nominations, mandate, weigh-in, payments, draw, flights/groups;
- platform operator screen, judge tablet screen, scoreboard/hall screen;
- protocol/accounting CSV and XLSX exports;
- print-friendly protocol page for browser `Print / Save as PDF`.

Explicitly not included in the first pilot:

- public athlete self-registration and online payment provider;
- server-side PDF certificates, federation-specific certificate templates, awards ceremony deck;
- desktop/offline Tauri, local SQLite, sync event log, auto-update publishing.

Operational limitation: the first pilot is online-only. For tournament day, keep a manual paper/CSV fallback until offline sync is shipped.

## Required environment

API process:

- `NODE_ENV=production`
- `PORT=3000`
- `HOST=0.0.0.0`
- `DATABASE_URL=postgresql://...`
- `CORS_ORIGIN=https://<web-domain>`
- `JWT_SECRET=<random 48+ bytes base64>`
- `LOG_LEVEL=info`
- `SENTRY_DSN=<optional>`

One-time root seed:

- `ROOT_EMAIL`
- `ROOT_PASSWORD`
- `ROOT_DISPLAY_NAME`

Do not keep `ROOT_PASSWORD` in a long-lived env file after the first seed. Re-running `seed:root` rotates that account password.

## Deployment sequence

1. Install dependencies with the locked workspace versions:

   ```bash
   pnpm install --frozen-lockfile
   ```

2. Validate, typecheck, test, and build:

   ```bash
   pnpm release:check
   ```

3. Apply database migrations:

   ```bash
   pnpm release:migrate
   ```

4. Seed launch reference data:

   ```bash
   pnpm release:seed
   ```

5. Run the authenticated pilot smoke against the target API:

   ```bash
   PILOT_SMOKE_API_URL=https://<web-domain>/api \
   PILOT_SMOKE_EMAIL=<root-or-secretary-email> \
   PILOT_SMOKE_PASSWORD=<password> \
   pnpm release:smoke
   ```

   The smoke creates an isolated federation/competition/athlete/nomination, checks duplicate nomination rejection, draw, weigh-in/payment, component attempts, scoreboard, protocol CSV, and accounting CSV.

6. Start the API:

   ```bash
   pnpm --filter=@streetlifting/api start
   ```

7. Serve `apps/web/dist` from nginx or another static host. Proxy `/api/*` to the API with the `/api` prefix stripped, matching Vite dev behavior.

## Smoke checks

Run these after deployment:

```bash
curl -fsS https://<web-domain>/api/health
curl -fsS https://<web-domain>/api/health/competitions
curl -fsS https://<web-domain>/api/health/competition-ops
```

Manual web flow:

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

Post-login E2E QA flow:

1. Create/update the Playwright auth state automatically, when QA credentials are available:

   ```bash
   E2E_API_URL=https://<web-domain>/api \
   E2E_WEB_URL=https://<web-domain> \
   E2E_EMAIL=<root-or-secretary-email> \
   E2E_PASSWORD=<password> \
   pnpm --filter=@streetlifting/web e2e:auth
   ```

   Or save it after a manual browser login:

   ```bash
   E2E_WEB_URL=https://<web-domain> \
   pnpm --filter=@streetlifting/web e2e:auth:manual
   ```

2. Run the browser QA flow with the saved `apps/web/e2e/.auth/secretary.json` state:

   ```bash
   E2E_API_URL=https://<web-domain>/api \
   E2E_WEB_URL=https://<web-domain> \
   E2E_SKIP_WEB_SERVER=1 \
   pnpm e2e:web
   ```

3. The spec covers federation creation, competition creation, athlete creation, default setup, nomination creation, draw, mandate/payment/weigh-in, attempt save, scoreboard, operator/judge surfaces, print protocol, and CSV/XLSX downloads.

## Post-pilot work

Do not block the first web pilot on these items:

- server-side PDF certificate rendering;
- federation-specific certificate and awards templates;
- awards ceremony automation;
- offline desktop/Tauri with SQLite and sync;
- installer signing and auto-update publishing for V2 desktop builds.

## Rollback notes

- Code rollback is safe if no migration has been applied.
- After `release:migrate`, rollback must follow Prisma migration policy for the exact migration set. Do not manually edit production tables.
- Reference seeds are idempotent except `seed:root`, which intentionally rotates the root password.
