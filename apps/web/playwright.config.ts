import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(webDir, '../..');
const apiDir = resolve(repoRoot, 'apps/api');
const webBaseUrl = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:1420';
const apiBaseUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:3000';
const authStateFile = resolve(webDir, 'e2e/.auth/secretary.json');
const webPort = new URL(webBaseUrl).port || '1420';
const apiPort = new URL(apiBaseUrl).port || '3000';
const startServers = process.env.E2E_SKIP_WEB_SERVER !== '1';
const webServer = [
  {
    command: 'node --env-file=.env node_modules/tsx/dist/cli.mjs src/index.ts',
    cwd: apiDir,
    env: { ...process.env, HOST: '127.0.0.1', PORT: apiPort },
    url: `${apiBaseUrl}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${webPort}`,
    cwd: webDir,
    env: { ...process.env, VITE_API_PROXY_TARGET: apiBaseUrl },
    url: webBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
];

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: resolve(repoRoot, 'output/playwright/html') }],
  ],
  outputDir: resolve(repoRoot, 'output/playwright/results'),
  use: {
    baseURL: webBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  ...(startServers ? { webServer } : {}),
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: authStateFile,
      },
    },
  ],
});
