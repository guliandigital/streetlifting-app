import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.E2E_ISOLATED !== '1' || !process.env.E2E_OUTPUT_DIR) {
  throw new Error('Use check:personal-data:db --run --browser');
}
const webDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(webDir, '../api');
const webUrl = new URL(process.env.E2E_WEB_URL!);
const apiUrl = new URL(process.env.E2E_API_URL!);
for (const url of [webUrl, apiUrl]) {
  if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:')
    throw new Error('Loopback required');
}

export default defineConfig({
  testDir: './e2e',
  ...(process.env.E2E_FULL_SUITE === '1'
    ? {
        projects: [
          { name: 'desktop', testIgnore: [/auth\.setup\.ts/, /mobile-launch-smoke\.spec\.ts/] },
          {
            name: 'mobile-tablet',
            testMatch: /mobile-launch-smoke\.spec\.ts/,
            use: {
              viewport: { width: 390, height: 844 },
              deviceScaleFactor: 2,
              isMobile: true,
              hasTouch: true,
            },
          },
        ],
      }
    : { testMatch: ['public-registration.spec.ts', 'personal-data-real.spec.ts'] }),
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(process.env.E2E_OUTPUT_DIR, 'browser.json') }],
  ],
  outputDir: resolve(process.env.E2E_OUTPUT_DIR, 'browser-artifacts'),
  use: {
    ...devices['Desktop Chrome'],
    ...(process.env.E2E_BROWSER_CHANNEL ? { channel: process.env.E2E_BROWSER_CHANNEL } : {}),
    baseURL: webUrl.origin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: [
    {
      command: 'node node_modules/tsx/dist/cli.mjs src/index.ts',
      cwd: apiDir,
      env: { ...process.env, HOST: '127.0.0.1', PORT: apiUrl.port },
      url: `${apiUrl.origin}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${webUrl.port}`,
      cwd: webDir,
      env: { ...process.env, VITE_API_PROXY_TARGET: apiUrl.origin, VITE_LIVE_UPDATES_WS: 'false' },
      url: webUrl.origin,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
