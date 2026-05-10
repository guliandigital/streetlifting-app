import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = resolve(webDir, '../api');
const authFile = resolve(webDir, 'e2e/.auth/secretary.json');
const webBaseUrl = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:1420';
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

test('authenticate platform admin for secretary flow', async ({ request }) => {
  const response = await request.post(`${apiBaseUrl}/auth/login`, {
    data: {
      email: process.env.E2E_EMAIL ?? requireEnv('ROOT_EMAIL'),
      password: process.env.E2E_PASSWORD ?? requireEnv('ROOT_PASSWORD'),
    },
  });
  expect(response.ok()).toBe(true);

  const body = (await response.json()) as {
    refreshToken: string;
    user: { id: string; email: string; displayName: string };
  };
  await mkdir(dirname(authFile), { recursive: true });
  await writeFile(
    authFile,
    JSON.stringify(
      {
        cookies: [],
        origins: [
          {
            origin: webBaseUrl,
            localStorage: [
              { name: 'streetlifting.refresh.v1', value: body.refreshToken },
              { name: 'streetlifting.e2e.user.v1', value: JSON.stringify(body.user) },
              { name: 'i18nextLng', value: 'ru' },
            ],
          },
        ],
      },
      null,
      2,
    ),
  );
});
