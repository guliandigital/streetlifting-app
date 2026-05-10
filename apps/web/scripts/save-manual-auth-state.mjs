import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REFRESH_KEY = 'streetlifting.refresh.v1';
const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const authFile = resolve(webDir, 'e2e/.auth/secretary.json');
const webBaseUrl = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:1420';
const timeoutMs = Number(process.env.E2E_MANUAL_AUTH_TIMEOUT_MS ?? '300000');

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ locale: 'ru-RU' });
const page = await context.newPage();

try {
  console.log(`Open login page: ${webBaseUrl}/login`);
  console.log(`Log in manually. Auth state will be saved to ${authFile}`);

  await page.goto(`${webBaseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    (refreshKey) => {
      const token = window.sessionStorage.getItem(refreshKey) ?? window.localStorage.getItem(refreshKey);
      if (!token) return false;
      window.localStorage.setItem(refreshKey, token);
      window.localStorage.setItem('i18nextLng', 'ru');
      return true;
    },
    REFRESH_KEY,
    { timeout: timeoutMs },
  );

  await mkdir(dirname(authFile), { recursive: true });
  await context.storageState({ path: authFile });
  console.log(`Saved Playwright auth state: ${authFile}`);
} finally {
  await browser.close();
}
