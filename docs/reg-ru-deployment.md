# reg.ru production deployment

This document connects local/GitHub deployments to the reg.ru production server that serves `streetlifting.app`.

## Current blocker

`streetlifting.app` resolves to `168.222.142.61`, but SSH from this workstation currently fails:

```text
deploy@streetlifting.app: Permission denied (publickey,password).
```

Deployment will work only after the deploy public key is installed on the server for the `deploy` user.

## One-time SSH setup

Create a local key if one does not exist:

```powershell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\streetlifting_reg_ru_ed25519 -C "streetlifting-reg-ru-deploy"
Get-Content $env:USERPROFILE\.ssh\streetlifting_reg_ru_ed25519.pub
```

Add this public key to `/home/deploy/.ssh/authorized_keys` on the reg.ru server. If only root/panel access exists, create the deploy user first:

```bash
adduser deploy
usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
nano /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```

Add the local SSH alias:

```sshconfig
Host streetlifting-prod
    HostName 168.222.142.61
    User deploy
    IdentityFile ~/.ssh/streetlifting_reg_ru_ed25519
    IdentitiesOnly yes
```

Verify:

```powershell
ssh streetlifting-prod "echo ok"
```

## One-time server setup

Install runtime packages:

```bash
sudo apt update
sudo apt install -y git curl nginx postgresql-client
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
sudo mkdir -p /opt/streetlifting-app /var/www/streetlifting.app
sudo chown -R deploy:deploy /opt/streetlifting-app
```

Install API env:

```bash
sudo install -m 600 -o root -g root deploy/env/streetlifting-api.env.example /etc/streetlifting-api.env
sudo nano /etc/streetlifting-api.env
```

Set real values for:

- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `SENTRY_DSN` if used

Install systemd:

```bash
sudo cp deploy/systemd/streetlifting-api.service /etc/systemd/system/streetlifting-api.service
sudo systemctl daemon-reload
sudo systemctl enable streetlifting-api
```

Install nginx:

```bash
sudo cp deploy/nginx/streetlifting.app.conf /etc/nginx/sites-available/streetlifting.app
sudo ln -sfn /etc/nginx/sites-available/streetlifting.app /etc/nginx/sites-enabled/streetlifting.app
sudo nginx -t
sudo systemctl reload nginx
```

Install TLS certificate if it is not already present:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d streetlifting.app -d www.streetlifting.app
```

## Local deploy from Windows

Deploy the current branch:

```powershell
.\scripts\deploy-reg-ru.ps1 -SshTarget streetlifting-prod -Branch main
```

Useful options:

```powershell
.\scripts\deploy-reg-ru.ps1 -SshTarget streetlifting-prod -Branch codex/pilot-mvp-secretariat
.\scripts\deploy-reg-ru.ps1 -SshTarget streetlifting-prod -Branch main -SkipMigrations
.\scripts\deploy-reg-ru.ps1 -SshTarget deploy@168.222.142.61 -Port 22 -Branch main
```

The script:

1. rejects uncommitted tracked changes;
2. runs `pnpm install --frozen-lockfile` and `pnpm release:check`;
3. uploads `deploy/remote-deploy.sh`;
4. makes the server pull the selected branch;
5. runs Prisma generate/migrations, API build, web build;
6. replaces `/var/www/streetlifting.app`;
7. restarts `streetlifting-api`;
8. smokes `https://streetlifting.app/api/health`.

## GitHub Actions deploy

Add repository or environment secrets:

- `REG_RU_HOST` = `168.222.142.61`
- `REG_RU_PORT` = `22`
- `REG_RU_USER` = `deploy`
- `REG_RU_SSH_KEY` = private deploy key

Run **Deploy production** from GitHub Actions, choose `main` after PR merge, and keep `skip_migrations=false` unless migrations were already applied.

## Federation account provisioning

After deploy, create or rotate a federation login on the server:

```bash
cd /opt/streetlifting-app
FEDERATION_CODE=<code> \
FEDERATION_USER_EMAIL=<email> \
FEDERATION_USER_PASSWORD=<temporary-password> \
FEDERATION_USER_DISPLAY_NAME=<display-name> \
pnpm --filter=@streetlifting/api seed:federation-user
```

Do not store the temporary password in a long-lived env file or send it through chat. Deliver it through a secure channel and ask the user to change it after first login.

## Smoke checklist

```bash
curl -fsS https://streetlifting.app/api/health
curl -fsS https://streetlifting.app/api/health/competitions
curl -fsS https://streetlifting.app/api/health/competition-ops
curl -fsSI https://streetlifting.app/sw.js | grep -Ei 'content-type|cache-control'
curl -fsSI https://streetlifting.app/service-worker.js | grep -Ei 'content-type|cache-control'
ISF_META_STATUS=$(curl -sS -o /dev/null -w '%{http_code}' https://streetlifting.app/api/isf/v1/meta)
test "$ISF_META_STATUS" = "401"
```

Authenticated ISF smoke, after issuing a service-client token:

```bash
ISF_SMOKE_API_URL=https://streetlifting.app/api \
ISF_SMOKE_SERVICE_TOKEN=<service-client-token> \
ISF_SMOKE_TENANT=ru \
pnpm release:smoke:isf
```

The script checks that anonymous access is rejected, browser-origin requests are rejected, and the
readonly ISF export endpoints respond with valid payload structure. Keep the token out of committed
files and long-lived shell history.

For the normal production path, add `ISF_SMOKE_SERVICE_TOKEN` as a GitHub `production` environment
secret and run the `ISF production smoke` workflow. The production deploy workflow also uses this
secret when present; if it is absent, deploy smoke still validates the anonymous `401` guard and the
separate smoke workflow can be run with `allow_anonymous_only=true`.

Manual:

1. Log in as root/platform admin.
2. Open a federation.
3. Log in as a federation user and confirm redirect to `/federations/<id>`.
4. Toggle dark/light theme.
5. Open inventory, notifications, reports, certificates, awards, and broadcast pages.
