#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${STREETLIFTING_APP_DIR:-/opt/streetlifting-app}"
WEB_ROOT="${STREETLIFTING_WEB_ROOT:-/var/www/streetlifting.app}"
REPO_URL="${STREETLIFTING_REPO_URL:-https://github.com/guliandigital/streetlifting-app.git}"
BRANCH="${STREETLIFTING_BRANCH:-main}"
API_SERVICE="${STREETLIFTING_API_SERVICE:-streetlifting-api}"
ISF_ID_SERVICE="${STREETLIFTING_ISF_ID_SERVICE:-isf-id}"
API_PORT="${STREETLIFTING_API_PORT:-3000}"
ISF_ID_PORT="${STREETLIFTING_ISF_ID_PORT:-3100}"
SKIP_MIGRATIONS="${STREETLIFTING_SKIP_MIGRATIONS:-0}"

if [[ "${API_SERVICE}" != *.service ]]; then
  API_SERVICE="${API_SERVICE}.service"
fi
if [[ "${ISF_ID_SERVICE}" != *.service ]]; then
  ISF_ID_SERVICE="${ISF_ID_SERVICE}.service"
fi

if command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  SUDO=""
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command git
require_command node
require_command pnpm

${SUDO} mkdir -p "${APP_DIR}" "${WEB_ROOT}"
${SUDO} chown -R "$(id -un):$(id -gn)" "${APP_DIR}"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
fi

cd "${APP_DIR}"

git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile
pnpm --filter=@streetlifting/api db:generate

if [[ "${SKIP_MIGRATIONS}" != "1" ]]; then
  pnpm release:migrate
  if [[ -r /etc/isf-id.env ]]; then
    ${SUDO} bash -lc "cd '${APP_DIR}/apps/isf-id' && set -a && . /etc/isf-id.env && set +a && pnpm db:deploy"
  else
    echo "Missing /etc/isf-id.env required for ISF ID migrations" >&2
    exit 1
  fi
fi

pnpm build:packages
pnpm --filter=@streetlifting/api build
pnpm --filter=@streetlifting/web build
pnpm --filter=@streetlifting/isf-id build

if [[ ! -d "apps/web/dist" ]]; then
  echo "apps/web/dist was not produced" >&2
  exit 1
fi

${SUDO} mkdir -p "${WEB_ROOT}"
${SUDO} find "${WEB_ROOT}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
${SUDO} cp -a apps/web/dist/. "${WEB_ROOT}/"
${SUDO} chown -R www-data:www-data "${WEB_ROOT}" 2>/dev/null || true
${SUDO} find "${WEB_ROOT}" -type d -exec chmod 755 {} +
${SUDO} find "${WEB_ROOT}" -type f -exec chmod 644 {} +

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "${API_SERVICE}" >/dev/null 2>&1; then
  ${SUDO} systemctl restart "${API_SERVICE}"
  ${SUDO} systemctl --no-pager --full status "${API_SERVICE}" || true
else
  echo "WARNING: ${API_SERVICE} was not found in systemd; API process was not restarted" >&2
fi

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "${ISF_ID_SERVICE}" >/dev/null 2>&1; then
  ${SUDO} systemctl restart "${ISF_ID_SERVICE}"
  ${SUDO} systemctl --no-pager --full status "${ISF_ID_SERVICE}" || true
else
  echo "WARNING: ${ISF_ID_SERVICE} was not found in systemd; ISF ID process was not restarted" >&2
fi

for attempt in {1..30}; do
  if curl -fsS "http://127.0.0.1:${API_PORT}/health" >/dev/null; then
    break
  fi
  if [[ "${attempt}" == "30" ]]; then
    echo "API health check failed after ${attempt} attempts" >&2
    exit 1
  fi
  sleep 1
done

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "${ISF_ID_SERVICE}" >/dev/null 2>&1; then
  for attempt in {1..30}; do
    if curl -fsS "http://127.0.0.1:${ISF_ID_PORT}/health" >/dev/null; then
      break
    fi
    if [[ "${attempt}" == "30" ]]; then
      echo "ISF ID health check failed after ${attempt} attempts" >&2
      exit 1
    fi
    sleep 1
  done
fi
echo "OK: deployed ${BRANCH} to ${APP_DIR}, web root ${WEB_ROOT}, API port ${API_PORT}"
