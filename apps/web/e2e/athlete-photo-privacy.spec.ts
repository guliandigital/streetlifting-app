import { expect, test } from '@playwright/test';

// Isolated browser contract; no backend or real sporting profile is used.
test('athlete detail loads private photos with Bearer auth and renders a blob URL', async ({
  page,
}) => {
  const id = '00000000-0000-4000-8000-000000000501';
  let authenticatedPhoto = false;
  await page.addInitScript(() => {
    localStorage.setItem('streetlifting.locale.v1', 'ru');
    sessionStorage.setItem(
      'streetlifting.e2e.session.v1',
      JSON.stringify({
        user: {
          id: 'admin',
          displayName: 'Admin',
          email: 'admin@example.test',
          roles: [{ role: 'platform_admin', federationId: null, competitionId: null }],
        },
        accessToken: 'photo-test-token',
        refreshToken: 'photo-test-refresh',
      }),
    );
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname.endsWith('/photo')) {
      authenticatedPhoto = route.request().headers().authorization === 'Bearer photo-test-token';
      expect(authenticatedPhoto).toBe(true);
      return route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
          'base64',
        ),
      });
    }
    if (url.pathname === `/api/athletes/${id}`)
      return route.fulfill({
        json: {
          athlete: {
            id,
            lastName: 'Photo',
            firstName: 'Athlete',
            middleName: null,
            dateOfBirth: '1990-01-01',
            gender: 'M',
            countryCode: 'RU',
            regionCode: null,
            city: null,
            clubName: null,
            coachName: null,
            federationCardNumber: null,
            photoUrl: `/api/athletes/${id}/photo`,
            updatedAt: '2026-09-19',
            createdAt: '2026-09-19',
          },
        },
      });
    return route.fulfill({
      json: {
        federations: [],
        countries: [],
        regions: [],
        appearances: [],
        records: [],
        documents: [],
        attachments: [],
        total: 0,
      },
    });
  });
  await page.goto(`/athletes/${id}`);
  await expect(page.getByRole('img', { name: 'Photo Athlete' })).toHaveAttribute('src', /^blob:/);
  expect(authenticatedPhoto).toBe(true);
});
