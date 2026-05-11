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
}> {
  const response = await request.post(`${apiBaseUrl}/auth/login`, {
    data: {
      email: process.env.E2E_EMAIL ?? requireEnv('ROOT_EMAIL'),
      password: process.env.E2E_PASSWORD ?? requireEnv('ROOT_PASSWORD'),
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as { accessToken: string; refreshToken: string };
}

export function authHeaders(accessToken: string): { Authorization: string } {
  return { Authorization: `Bearer ${accessToken}` };
}

export function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}

export async function installFreshAuth(
  page: Page,
): Promise<void> {
  await page.goto('/login');
  await page.evaluate(
    (refreshKey) => {
      window.sessionStorage.removeItem(refreshKey);
      window.localStorage.removeItem(refreshKey);
      window.localStorage.setItem('i18nextLng', 'ru');
    },
    REFRESH_KEY,
  );
  await page.locator('#email').fill(process.env.E2E_EMAIL ?? requireEnv('ROOT_EMAIL'));
  await page.locator('#password').fill(process.env.E2E_PASSWORD ?? requireEnv('ROOT_PASSWORD'));
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/me$/);
}
