import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { apiUrl, authHeaders, installFreshAuth, loginViaApi } from './helpers/auth.js';

interface CompetitionSetup {
  competitionId: string;
  federationCode: string;
  suffix: string;
  auth: {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; displayName: string };
  };
}

interface PublicRegistrationDetails {
  competition: {
    divisions: Array<{
      id: string;
      gender: 'M' | 'F';
      weightClasses: Array<{ id: string }>;
    }>;
  };
  disciplines: Array<{ id: string; code: string; nameRu: string }>;
}

interface OpsResponse {
  nominations: Array<{
    id: string;
    athlete: { lastName: string };
  }>;
}

async function createLaunchCompetition(request: APIRequestContext): Promise<CompetitionSetup> {
  const suffix = Date.now().toString(36).slice(-7).toUpperCase();
  const auth = await loginViaApi(request);
  const headers = authHeaders(auth.accessToken);

  const federationResponse = await request.post(apiUrl('/federations'), {
    headers,
    data: {
      code: `ML${suffix}`,
      nameRu: `Мобильная федерация ${suffix}`,
      nameEn: `Mobile Federation ${suffix}`,
      countryCode: 'AM',
      billingTariffKopecksPerNomination: 5000,
    },
  });
  expect(federationResponse.ok(), await federationResponse.text()).toBe(true);
  const federationBody = (await federationResponse.json()) as {
    federation: { id: string; code: string };
  };

  const competitionResponse = await request.post(apiUrl('/competitions'), {
    headers,
    data: {
      federationId: federationBody.federation.id,
      code: `MLE2E${suffix}`,
      nameRu: `Мобильный launch smoke ${suffix}`,
      nameEn: `Mobile Launch Smoke ${suffix}`,
      rulebook: 'ISF v5.1',
      startDate: '2026-08-15',
      endDate: '2026-08-15',
      city: 'Yerevan',
      venue: 'Mobile Hall',
      timezone: 'Asia/Yerevan',
      status: 'draft',
      entryFeeKopecks: 120000,
      isOnlineRegistrationOpen: true,
    },
  });
  expect(competitionResponse.ok(), await competitionResponse.text()).toBe(true);
  const competitionBody = (await competitionResponse.json()) as { competition: { id: string } };

  const setupResponse = await request.post(
    apiUrl(`/competitions/${competitionBody.competition.id}/setup/default`),
    { headers, data: {} },
  );
  expect(setupResponse.ok(), await setupResponse.text()).toBe(true);

  return {
    competitionId: competitionBody.competition.id,
    federationCode: federationBody.federation.code,
    suffix,
    auth,
  };
}

async function expectUsableViewport(page: Page): Promise<void> {
  await expect(page.locator('body')).not.toContainText('Unexpected Application Error');
  await expect(page.locator('body')).not.toContainText('Восстанавливаем сессию');

  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.clientWidth + 4);
}

test('mobile launch smoke covers public registration and tournament tablet surfaces', async ({
  page,
  request,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error' && !text.startsWith('Failed to load resource:')) {
      pageErrors.push(text);
    }
  });

  const setup = await createLaunchCompetition(request);
  const headers = authHeaders(setup.auth.accessToken);

  const publicDetailsResponse = await request.get(
    apiUrl(`/public/competitions/${setup.competitionId}/registration`),
  );
  expect(publicDetailsResponse.ok(), await publicDetailsResponse.text()).toBe(true);
  const publicDetails = (await publicDetailsResponse.json()) as PublicRegistrationDetails;
  const discipline = publicDetails.disciplines.find((item) => item.code === 'classic_pu');
  const division = publicDetails.competition.divisions.find((item) => item.gender === 'M');
  const weightClass = division?.weightClasses[0];
  expect(discipline).toBeTruthy();
  expect(division).toBeTruthy();
  expect(weightClass).toBeTruthy();

  const athleteLastName = `Mobile${setup.suffix}`;

  await page.goto(`/federations/${setup.federationCode}/register`);
  await expect(page.getByTestId('public-federation-registration')).toBeVisible();
  await expectUsableViewport(page);

  await page.getByTestId('public-registration-competition').click();
  await expect(page).toHaveURL(new RegExp(`/register/${setup.competitionId}`));
  await expect(page.getByTestId('public-registration')).toBeVisible();
  await expectUsableViewport(page);

  await page.getByTestId('public-reg-last-name').fill(athleteLastName);
  await page.getByTestId('public-reg-first-name').fill('Tablet');
  await page.getByTestId('public-reg-dob').fill('1997-03-04');
  await page.getByTestId('public-reg-gender').selectOption('M');
  await page.getByTestId('public-reg-country').fill('AM');
  await page.getByTestId('public-reg-discipline').selectOption(discipline!.id);
  await page.getByTestId('public-reg-division').selectOption(division!.id);
  await page.getByTestId('public-reg-weight-class').selectOption(weightClass!.id);
  await page.getByTestId('public-reg-consent-data').check();

  const [registrationResponse] = await Promise.all([
    page.waitForResponse((item) =>
      item.url().includes(`/public/competitions/${setup.competitionId}/registrations`),
    ),
    page.getByTestId('public-reg-submit').click(),
  ]);
  expect(registrationResponse.ok(), await registrationResponse.text()).toBe(true);
  await expect(page.getByTestId('public-registration-success')).toBeVisible();
  await expectUsableViewport(page);

  const opsResponse = await request.get(apiUrl(`/competitions/${setup.competitionId}/ops`), {
    headers,
  });
  expect(opsResponse.ok(), await opsResponse.text()).toBe(true);
  const opsBody = (await opsResponse.json()) as OpsResponse;
  const nomination = opsBody.nominations.find((item) => item.athlete.lastName === athleteLastName);
  expect(nomination).toBeTruthy();

  const mandateResponse = await request.patch(apiUrl(`/nominations/${nomination!.id}`), {
    headers,
    data: {
      bodyWeightAtWeighIn: 82.4,
      paymentStatus: 'paid',
      paidAmountKopecks: 120000,
      paymentMethod: 'cash',
      isMandatePassed: true,
      status: 'on_platform',
    },
  });
  expect(mandateResponse.ok(), await mandateResponse.text()).toBe(true);

  const drawResponse = await request.post(
    apiUrl(`/competitions/${setup.competitionId}/nominations/draw`),
    { headers, data: { overwrite: true } },
  );
  expect(drawResponse.ok(), await drawResponse.text()).toBe(true);
  const planResponse = await request.post(
    apiUrl(`/competitions/${setup.competitionId}/flights/auto-plan`),
    { headers, data: { maxNominationsPerGroup: 12, minutesPerAttempt: 1 } },
  );
  expect(planResponse.ok(), await planResponse.text()).toBe(true);

  await page.setViewportSize({ width: 768, height: 1024 });
  await installFreshAuth(page);
  for (const route of [
    {
      path: `/competitions/${setup.competitionId}/nominations`,
      testId: 'competition-ops',
    },
    {
      path: `/competitions/${setup.competitionId}/operator`,
      testId: 'competition-operator',
      field: 'operator-nomination',
    },
    {
      path: `/competitions/${setup.competitionId}/judge`,
      testId: 'competition-judge',
      field: 'judge-nomination',
    },
    {
      path: `/competitions/${setup.competitionId}/protocol-print`,
      testId: 'protocol-print',
    },
  ]) {
    await page.goto(route.path);
    await expect(page.getByTestId(route.testId)).toBeVisible();
    if (route.field) {
      const field = page.getByTestId(route.field);
      await expect(field).toBeVisible();
      const selectedText = await field.evaluate(
        (select) => (select as HTMLSelectElement).selectedOptions[0]?.textContent ?? '',
      );
      expect(selectedText).toContain(athleteLastName);
    } else {
      await expect(
        page.getByRole('cell', { name: new RegExp(athleteLastName) }).first(),
      ).toBeVisible();
    }
    await expectUsableViewport(page);
  }

  await page.goto(`/broadcast/competitions/${setup.competitionId}`);
  await expect(page.getByTestId('public-broadcast')).toBeVisible();
  await expect(page.getByText('Текущее выступление:')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Зачёт' })).toHaveCount(0);
  await expectUsableViewport(page);

  expect(pageErrors).toEqual([]);
});
