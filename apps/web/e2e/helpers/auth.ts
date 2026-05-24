import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REFRESH_KEY = 'streetlifting.refresh.v1';
const E2E_SESSION_KEY = 'streetlifting.e2e.session.v1';
const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const apiDir = resolve(webDir, '../api');
const apiBaseUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3000';

interface E2EAuthUser {
  id: string;
  email: string;
  displayName: string;
  roles: Array<{ role: string; federationId: string | null; competitionId: string | null }>;
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for Playwright auth setup`);
  return value;
}

loadEnvFile(resolve(apiDir, '.env'));

export async function loginViaApi(request: APIRequestContext): Promise<{
  accessToken: string;
  refreshToken: string;
  user: E2EAuthUser;
}> {
  const credentials = {
    email: process.env.E2E_EMAIL ?? requireEnv('ROOT_EMAIL'),
    password: process.env.E2E_PASSWORD ?? requireEnv('ROOT_PASSWORD'),
  };

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await request.post(`${apiBaseUrl}/auth/login`, { data: credentials });
    const text = await response.text();
    if (response.ok()) {
      const login = JSON.parse(text) as {
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; displayName: string };
      };
      const me = await request.get(`${apiBaseUrl}/auth/me`, {
        headers: authHeaders(login.accessToken),
      });
      const meText = await me.text();
      expect(me.ok(), meText).toBe(true);
      return { ...login, user: (JSON.parse(meText) as { user: E2EAuthUser }).user };
    }
    if (response.status() === 429 && attempt < 5) {
      const retrySeconds = Number(/retry in (\d+) seconds/i.exec(text)?.[1] ?? 2);
      await new Promise((resolve) => setTimeout(resolve, (retrySeconds + 1) * 1000));
      continue;
    }
    expect(response.ok(), text).toBe(true);
  }
  throw new Error('unreachable login retry state');
}

export function authHeaders(accessToken: string): { Authorization: string } {
  return { Authorization: `Bearer ${accessToken}` };
}

export function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}

export async function installFreshAuth(page: Page): Promise<void> {
  const auth = await loginViaApi(page.request);
  await page.addInitScript(
    ({ e2eSessionKey, refreshKey, authSession }) => {
      window.localStorage.removeItem(refreshKey);
      window.localStorage.removeItem('streetlifting.e2e.user.v1');
      window.sessionStorage.setItem(refreshKey, authSession.refreshToken);
      window.sessionStorage.setItem(e2eSessionKey, JSON.stringify(authSession));
      window.localStorage.setItem('i18nextLng', 'ru');
    },
    {
      e2eSessionKey: E2E_SESSION_KEY,
      refreshKey: REFRESH_KEY,
      authSession: {
        user: auth.user,
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
      },
    },
  );
  await page.goto('/federations');
  await expect(page).toHaveURL(/\/federations(?:[/?#]|$)/);
  await expect(page.locator('a[href="/login"]')).toHaveCount(0);
}
