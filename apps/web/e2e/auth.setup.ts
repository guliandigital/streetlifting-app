import { test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loginViaApi } from './helpers/auth.js';

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const authFile = resolve(webDir, 'e2e/.auth/secretary.json');
const webBaseUrl = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:1420';

test('authenticate platform admin for secretary flow', async ({ request }) => {
  const body = await loginViaApi(request);
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
