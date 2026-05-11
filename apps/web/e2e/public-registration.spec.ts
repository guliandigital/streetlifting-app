import { expect, test, type Page } from '@playwright/test';
import { apiUrl, authHeaders, loginViaApi } from './helpers/auth.js';

async function clickAndWaitForApi(
  page: Page,
  method: string,
  urlPart: string,
  click: () => Promise<void>,
): Promise<void> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (item) => item.request().method() === method && item.url().includes(urlPart),
    ),
    click(),
  ]);
  expect(response.ok(), await response.text()).toBe(true);
}

test('public online registration creates a draft nomination for secretary review', async ({
  page,
  request,
}) => {
  const suffix = Date.now().toString(36).slice(-7).toUpperCase();
  const federationCode = `OR${suffix}`;
  const competitionCode = `ORE2E${suffix}`;
  const athleteLastName = `Online${suffix}`;

  const auth = await loginViaApi(request);
  const headers = authHeaders(auth.accessToken);
  const federationResponse = await request.post(apiUrl('/federations'), {
    headers,
    data: {
      code: federationCode,
      nameRu: `Онлайн федерация ${suffix}`,
      nameEn: `Online Federation ${suffix}`,
      countryCode: 'RU',
      billingTariffKopecksPerNomination: 5000,
    },
  });
  expect(federationResponse.ok(), await federationResponse.text()).toBe(true);
  const federationBody = (await federationResponse.json()) as { federation: { id: string } };

  const competitionResponse = await request.post(apiUrl('/competitions'), {
    headers,
    data: {
      federationId: federationBody.federation.id,
      code: competitionCode,
      nameRu: `Онлайн регистрация ${suffix}`,
      nameEn: `Online Registration ${suffix}`,
      rulebook: 'ISF v5.1',
      startDate: '2026-07-10',
      endDate: '2026-07-10',
      city: 'Yerevan',
      venue: 'Public Hall',
      timezone: 'Asia/Yerevan',
      status: 'draft',
      entryFeeKopecks: 120000,
      isOnlineRegistrationOpen: true,
    },
  });
  expect(competitionResponse.ok(), await competitionResponse.text()).toBe(true);
  const competitionBody = (await competitionResponse.json()) as { competition: { id: string } };
  const competitionId = competitionBody.competition.id;

  const setupResponse = await request.post(
    apiUrl(`/competitions/${competitionId}/setup/default`),
    { headers, data: {} },
  );
  expect(setupResponse.ok(), await setupResponse.text()).toBe(true);

  await page.goto(`/federations/${federationCode}/register`);
  await expect(page.getByTestId('public-federation-registration')).toBeVisible();
  await expect(page.getByTestId('public-registration-competition')).toContainText(
    `Онлайн регистрация ${suffix}`,
  );
  await page.getByTestId('public-registration-competition').click();
  await expect(page).toHaveURL(new RegExp(`/register/${competitionId}`));
  await expect(page.getByTestId('public-registration')).toBeVisible();

  await page.getByTestId('public-reg-last-name').fill(athleteLastName);
  await page.getByTestId('public-reg-first-name').fill('Participant');
  await page.getByTestId('public-reg-dob').fill('1998-02-03');
  await page.getByTestId('public-reg-gender').selectOption('M');
  await page.getByTestId('public-reg-country').fill('RU');
  await page
    .getByTestId('public-reg-discipline')
    .selectOption({ label: 'Классическое подтягивание' });
  await expect(page.getByTestId('public-reg-division')).not.toHaveValue('');
  await expect(page.getByTestId('public-reg-weight-class')).not.toHaveValue('');
  await page.getByTestId('public-reg-consent-data').check();

  await clickAndWaitForApi(
    page,
    'POST',
    `/public/competitions/${competitionId}/registrations`,
    () => page.getByTestId('public-reg-submit').click(),
  );
  await expect(page.getByTestId('public-registration-success')).toBeVisible();

  const opsResponse = await request.get(apiUrl(`/competitions/${competitionId}/ops`), {
    headers,
  });
  expect(opsResponse.ok(), await opsResponse.text()).toBe(true);
  const opsBody = (await opsResponse.json()) as {
    nominations: Array<{
      status: string;
      paymentStatus: string;
      athlete: { lastName: string };
    }>;
  };
  const nomination = opsBody.nominations.find((item) => item.athlete.lastName === athleteLastName);
  expect(nomination).toBeTruthy();
  expect(nomination?.status).toBe('draft');
  expect(nomination?.paymentStatus).toBe('unpaid');
});
