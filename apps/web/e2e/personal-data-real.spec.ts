import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { apiUrl, authHeaders } from './helpers/auth.js';

test('real API activates pending role only after browser acceptance', async ({ page, request }) => {
  test.skip(!process.env.E2E_PD_FIXTURE, 'Requires isolated synthetic role fixture');
  const fixture = JSON.parse(readFileSync(process.env.E2E_PD_FIXTURE!, 'utf8')) as {
    email: string;
    grantId: string;
    federationId: string;
  };
  const login = await request.post(apiUrl('/auth/login'), {
    data: { email: fixture.email, password: process.env.ROOT_PASSWORD },
  });
  expect(login.ok()).toBe(true);
  const session = (await login.json()) as { accessToken: string; refreshToken: string };
  const headers = authHeaders(session.accessToken);
  const before = await request.get(apiUrl('/auth/me'), { headers });
  const { user } = await before.json();
  expect(user.roles).toEqual([]);
  expect(user.pendingAcknowledgments[0].roleAssignmentId).toBe(fixture.grantId);
  await page.addInitScript(
    ({ session, user }) => {
      localStorage.setItem('streetlifting.locale.v1', 'ru');
      if (sessionStorage.getItem('pd-test-initialized')) return;
      sessionStorage.setItem('pd-test-initialized', '1');
      sessionStorage.setItem('streetlifting.e2e.session.v1', JSON.stringify({ ...session, user }));
      sessionStorage.setItem('streetlifting.refresh.v1', session.refreshToken);
    },
    { session, user },
  );
  await page.goto('/profile');
  const checkbox = page.getByTestId('access-acknowledgment-checkbox');
  const confirm = page.getByTestId('access-acknowledgment-confirm');
  await expect(checkbox).not.toBeChecked();
  await expect(confirm).toBeDisabled();
  await checkbox.check();
  const [accepted] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith(`/role-assignments/${fixture.grantId}/acknowledge`) &&
        response.request().method() === 'POST',
    ),
    confirm.click(),
  ]);
  expect(accepted.status()).toBe(200);
  await expect(checkbox).toHaveCount(0);
  const after = await request.get(apiUrl('/auth/me'), { headers });
  expect((await after.json()).user.roles).toContainEqual({
    role: 'secretary',
    federationId: fixture.federationId,
    competitionId: null,
  });
  await page.evaluate(() => sessionStorage.removeItem('streetlifting.e2e.session.v1'));
  const [refreshed] = await Promise.all([
    // Reload starts without an in-memory access token. Wait for the successful
    // retry after refresh, rather than the initial expected 401 response.
    page.waitForResponse(
      (response) => response.url().endsWith('/auth/me') && response.status() === 200,
    ),
    page.reload(),
  ]);
  expect(refreshed.status()).toBe(200);
  expect((await refreshed.json()).user.pendingAcknowledgments).toEqual([]);
  await expect(page.getByTestId('access-acknowledgment-checkbox')).toHaveCount(0);
});
