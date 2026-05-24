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

One-time federation user provisioning:

- `FEDERATION_ID` or `FEDERATION_CODE`
- `FEDERATION_USER_EMAIL`
- `FEDERATION_USER_PASSWORD`
- `FEDERATION_USER_DISPLAY_NAME`
- `FEDERATION_USER_ROLE` (`federation_admin`, `secretary`, or `accountant`; defaults to `federation_admin`)

Do not keep `FEDERATION_USER_PASSWORD` in a long-lived env file. Re-running `seed:federation-user` rotates that user's password and preserves existing non-revoked scoped roles.

## Deployment sequence

For reg.ru-specific SSH, nginx, systemd, and GitHub Actions setup, use [reg-ru-deployment.md](reg-ru-deployment.md). After one-time server setup, the normal deploy command from Windows is:

```powershell
.\scripts\deploy-reg-ru.ps1 -SshTarget streetlifting-prod -Branch main
```

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

4a. Provision a federation-scoped login when a federation account should open its workspace directly:

```bash
FEDERATION_CODE=<federation-code> \
FEDERATION_USER_EMAIL=<federation-email> \
FEDERATION_USER_PASSWORD=<temporary-password> \
FEDERATION_USER_DISPLAY_NAME=<display-name> \
pnpm --filter=@streetlifting/api seed:federation-user
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

   Deploy the web build with deletion enabled so old hashed assets cannot remain addressable forever:

   ```bash
   rsync -avz --delete apps/web/dist/ deploy@<server>:/var/www/streetlifting.app/
   ```

   Keep service-worker cleanup files outside the SPA fallback. They intentionally unregister any old PWA/service worker from the legacy app and clear browser caches:

   ```nginx
   location = /sw.js {
       add_header Cache-Control "no-store, no-cache, must-revalidate";
       default_type application/javascript;
       try_files $uri =404;
   }

   location = /service-worker.js {
       add_header Cache-Control "no-store, no-cache, must-revalidate";
       default_type application/javascript;
       try_files $uri =404;
   }

   location = /registerSW.js {
       add_header Cache-Control "no-store, no-cache, must-revalidate";
       default_type application/javascript;
       try_files $uri =404;
   }

   location /assets/ {
       add_header Cache-Control "public, max-age=31536000, immutable";
       try_files $uri =404;
   }

   location / {
       try_files $uri $uri/ /index.html;
   }
   ```

## Smoke checks

Run these after deployment:

```bash
curl -fsS https://<web-domain>/api/health
curl -fsS https://<web-domain>/api/health/competitions
curl -fsS https://<web-domain>/api/health/competition-ops
curl -fsSI https://<web-domain>/sw.js | grep -Ei 'content-type|cache-control'
curl -fsSI https://<web-domain>/service-worker.js | grep -Ei 'content-type|cache-control'
ISF_META_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' https://<web-domain>/api/isf/v1/meta)
test "$ISF_META_STATUS" = "401"
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
