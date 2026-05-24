import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REFRESH_KEY = 'streetlifting.refresh.v1';
const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const apiDir = resolve(webDir, '../api');
const apiBaseUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3000';

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
  user: { id: string; email: string; displayName: string };
}> {
  const credentials = {
    email: process.env.E2E_EMAIL ?? requireEnv('ROOT_EMAIL'),
    password: process.env.E2E_PASSWORD ?? requireEnv('ROOT_PASSWORD'),
  };

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await request.post(`${apiBaseUrl}/auth/login`, { data: credentials });
    const text = await response.text();
    if (response.ok()) {
      return JSON.parse(text) as {
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; displayName: string };
      };
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
    ({ refreshKey, refreshToken }) => {
      window.localStorage.removeItem(refreshKey);
      if (!window.sessionStorage.getItem(refreshKey)) {
        window.sessionStorage.setItem(refreshKey, refreshToken);
      }
      window.localStorage.setItem('i18nextLng', 'ru');
    },
    { refreshKey: REFRESH_KEY, refreshToken: auth.refreshToken },
  );
  await page.goto('/federations');
  await expect(page).toHaveURL(/\/federations(?:[/?#]|$)/);
  await expect(page.getByText(auth.user.displayName, { exact: true })).toBeVisible();
}
