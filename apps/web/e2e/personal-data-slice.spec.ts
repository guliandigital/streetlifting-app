import { expect, test } from '@playwright/test';

// Browser-only contract tests: all API requests are mocked; no database,
// provider credentials or existing signed-in session are used.
test('pending access can recover from load failure and requires explicit acceptance', async ({
  page,
}) => {
  const user = {
    id: 'test-user',
    email: 'test@example.test',
    displayName: 'Test user',
    roles: [],
    pendingAcknowledgments: [
      {
        roleAssignmentId: 'test-grant',
        role: 'secretary',
        federationId: 'test-federation',
        competitionId: null,
      },
    ],
  };
  let available = false;
  let accepted = false;
  await page.addInitScript((user) => {
    sessionStorage.setItem(
      'streetlifting.e2e.session.v1',
      JSON.stringify({ user, accessToken: 'test', refreshToken: 'test' }),
    );
    localStorage.setItem('streetlifting.locale.v1', 'ru');
  }, user);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/auth/access-acknowledgment') {
      return route.fulfill({
        status: !available ? 503 : 200,
        json: !available
          ? { error: { code: 'unavailable' } }
          : {
              textVersion: 'test-v1',
              texts: { ru: 'Обязательство тестовой федерации', en: 'Test obligation' },
            },
      });
    }
    if (url.pathname.endsWith('/acknowledge')) {
      expect(route.request().postDataJSON()).toEqual({ textVersion: 'test-v1' });
      accepted = true;
      return route.fulfill({ json: { status: 'ok' } });
    }
    if (url.pathname === '/api/auth/me')
      return route.fulfill({
        json: {
          user: { ...user, pendingAcknowledgments: accepted ? [] : user.pendingAcknowledgments },
        },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto('/profile');
  await expect(page.getByRole('button', { name: 'Повторить загрузку' })).toBeVisible();
  available = true;
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(page.getByText('Обязательство тестовой федерации')).toBeVisible();
  const checkbox = page.getByTestId('access-acknowledgment-checkbox');
  const confirm = page.getByTestId('access-acknowledgment-confirm');
  await expect(checkbox).not.toBeChecked();
  await expect(confirm).toBeDisabled();
  await checkbox.check();
  await confirm.click();
  await expect(checkbox).toHaveCount(0);
  expect(accepted).toBe(true);
});

test('registration sends the displayed consent snapshot and resets choices when it changes', async ({
  page,
}) => {
  let hash = 'a'.repeat(64);
  const submitted: unknown[] = [];
  await page.addInitScript(() => localStorage.setItem('streetlifting.locale.v1', 'ru'));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname.endsWith('/registrations')) {
      submitted.push(route.request().postDataJSON());
      hash = 'b'.repeat(64);
      return route.fulfill({
        status: 409,
        json: { error: { code: 'consent_changed', message: 'Changed' } },
      });
    }
    if (url.pathname.endsWith('/registration'))
      return route.fulfill({
        json: {
          competition: {
            id: 'competition',
            nameRu: 'Тестовый турнир',
            nameEn: 'Test meet',
            entryFeeKopecks: 0,
            federation: { nameRu: 'Тестовая федерация' },
            divisions: [
              {
                id: 'division',
                gender: 'M',
                nameRu: 'Мужчины',
                weightClasses: [{ id: 'weight', disciplineId: 'discipline', nameRu: 'До 80 кг' }],
              },
            ],
          },
          disciplines: [{ id: 'discipline', nameRu: 'Подтягивания' }],
          registration: { isAvailable: true, reason: null },
          consents: {
            snapshotHash: hash,
            textVersion: 'test',
            locale: 'ru',
            operatorConfigured: true,
            operator: { name: 'Оператор A', contact: 'pd@example.test' },
            texts: {
              dataProcessing: `Согласие ${hash[0]}`,
              publicResults: 'Публикация результатов',
              photoPublication: 'Публикация фото',
            },
          },
        },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto('/register/competition');
  await page.getByTestId('public-reg-last-name').fill('Иванов');
  await page.getByTestId('public-reg-first-name').fill('Иван');
  await page.getByTestId('public-reg-dob').fill('1990-01-01');
  await page.getByRole('checkbox', { name: 'Согласие a' }).check();
  await page.getByTestId('public-reg-submit').click();
  await expect(page.getByRole('checkbox', { name: 'Согласие b' })).not.toBeChecked();
  expect(submitted).toEqual([
    expect.objectContaining({
      consentSnapshotHash: 'a'.repeat(64),
      consentPhotoPublication: false,
      consentPublicResults: false,
    }),
  ]);
});
