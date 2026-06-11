import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { apiUrl, authHeaders, installFreshAuth, loginViaApi } from './helpers/auth.js';

interface ReportCompetitionSetup {
  competitionId: string;
}

interface PublicRegistrationDetails {
  competition: {
    divisions: Array<{
      id: string;
      gender: 'M' | 'F';
      weightClasses: Array<{ id: string }>;
    }>;
  };
  disciplines: Array<{ id: string; code: string }>;
}

interface OpsResponse {
  platforms: Array<{ id: string }>;
  nominations: Array<{
    id: string;
    athlete: { lastName: string };
  }>;
}

async function createReportCompetition(
  request: APIRequestContext,
): Promise<ReportCompetitionSetup> {
  const suffix = Date.now().toString(36).slice(-7).toUpperCase();
  const auth = await loginViaApi(request);
  const headers = authHeaders(auth.accessToken);
  const athleteLastName = `Report${suffix}`;

  const federationResponse = await request.post(apiUrl('/federations'), {
    headers,
    data: {
      code: `RP${suffix}`,
      nameRu: `Отчетная федерация ${suffix}`,
      nameEn: `Reports Federation ${suffix}`,
      countryCode: 'AM',
      billingTariffKopecksPerNomination: 5000,
    },
  });
  expect(federationResponse.ok(), await federationResponse.text()).toBe(true);
  const federationBody = (await federationResponse.json()) as {
    federation: { id: string };
  };

  const competitionResponse = await request.post(apiUrl('/competitions'), {
    headers,
    data: {
      federationId: federationBody.federation.id,
      code: `RPE2E${suffix}`,
      nameRu: `Отчетный smoke ${suffix}`,
      nameEn: `Reports Smoke ${suffix}`,
      rulebook: 'ISF v5.1',
      startDate: '2026-09-10',
      endDate: '2026-09-10',
      city: 'Yerevan',
      venue: 'Reports Hall',
      timezone: 'Asia/Yerevan',
      status: 'draft',
      entryFeeKopecks: 120000,
      isOnlineRegistrationOpen: true,
    },
  });
  expect(competitionResponse.ok(), await competitionResponse.text()).toBe(true);
  const competitionBody = (await competitionResponse.json()) as {
    competition: { id: string };
  };
  const competitionId = competitionBody.competition.id;

  const setupResponse = await request.post(apiUrl(`/competitions/${competitionId}/setup/default`), {
    headers,
    data: {},
  });
  expect(setupResponse.ok(), await setupResponse.text()).toBe(true);

  const detailsResponse = await request.get(
    apiUrl(`/public/competitions/${competitionId}/registration`),
  );
  expect(detailsResponse.ok(), await detailsResponse.text()).toBe(true);
  const details = (await detailsResponse.json()) as PublicRegistrationDetails;
  const discipline = details.disciplines.find((item) => item.code === 'classic_pu');
  const division = details.competition.divisions.find((item) => item.gender === 'M');
  const weightClass = division?.weightClasses[0];
  expect(discipline).toBeTruthy();
  expect(division).toBeTruthy();
  expect(weightClass).toBeTruthy();

  const registrationResponse = await request.post(
    apiUrl(`/public/competitions/${competitionId}/registrations`),
    {
      data: {
        athlete: {
          lastName: athleteLastName,
          firstName: 'Printable',
          dateOfBirth: '1995-04-05',
          gender: 'M',
          countryCode: 'AM',
          city: 'Yerevan',
          clubName: 'Reports Club',
        },
        disciplineId: discipline!.id,
        divisionId: division!.id,
        declaredWeightClassId: weightClass!.id,
        weightClassId: weightClass!.id,
        consentDataProcessing: true,
        consentPublicResults: true,
      },
    },
  );
  expect(registrationResponse.ok(), await registrationResponse.text()).toBe(true);

  let opsResponse = await request.get(apiUrl(`/competitions/${competitionId}/ops`), { headers });
  expect(opsResponse.ok(), await opsResponse.text()).toBe(true);
  let ops = (await opsResponse.json()) as OpsResponse;
  const nomination = ops.nominations.find((item) => item.athlete.lastName === athleteLastName);
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
    apiUrl(`/competitions/${competitionId}/nominations/draw`),
    {
      headers,
      data: { overwrite: true },
    },
  );
  expect(drawResponse.ok(), await drawResponse.text()).toBe(true);
  const planResponse = await request.post(
    apiUrl(`/competitions/${competitionId}/flights/auto-plan`),
    {
      headers,
      data: { maxNominationsPerGroup: 12, minutesPerAttempt: 1 },
    },
  );
  expect(planResponse.ok(), await planResponse.text()).toBe(true);

  opsResponse = await request.get(apiUrl(`/competitions/${competitionId}/ops`), { headers });
  expect(opsResponse.ok(), await opsResponse.text()).toBe(true);
  ops = (await opsResponse.json()) as OpsResponse;

  const judgeResponse = await request.post(apiUrl('/judges'), {
    headers,
    data: {
      lastName: `ReportJudge${suffix}`,
      firstName: 'Head',
      categoryRu: 'ВК',
      cardNumber: `RJ-${suffix}`,
    },
  });
  expect(judgeResponse.ok(), await judgeResponse.text()).toBe(true);
  const judgeBody = (await judgeResponse.json()) as { judge: { id: string } };
  const assignmentResponse = await request.post(
    apiUrl(`/competitions/${competitionId}/judge-assignments`),
    {
      headers,
      data: {
        judgeId: judgeBody.judge.id,
        role: 'head',
        platformId: ops.platforms[0]?.id ?? null,
      },
    },
  );
  expect(assignmentResponse.ok(), await assignmentResponse.text()).toBe(true);

  return { competitionId };
}

async function expectPrintablePreview(
  page: Page,
  tabTestId: string,
  buttonName: string,
  printableKind: string,
): Promise<void> {
  await page.getByTestId(tabTestId).click();
  const button = page.getByRole('button', { name: buttonName, exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByTestId(`printable-report-${printableKind}`)).toBeVisible();
  await expect(page.locator('.pt-actions').getByRole('button', { name: 'Печать' })).toBeEnabled();
  await page.getByRole('button', { name: 'Вернуться' }).click();
}

test('reports page exposes only wired print actions as active buttons', async ({
  page,
  request,
}) => {
  const setup = await createReportCompetition(request);
  await installFreshAuth(page);
  await page.goto(`/competitions/${setup.competitionId}/reports`);
  await expect(page.getByText('Отчеты, печатные формы')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Подробный' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'OpenPowerLifting' })).toBeDisabled();

  for (const action of [
    ['reports-tab-blanks', 'Бланк весов', 'weighInBlank'],
    ['reports-tab-blanks', 'Бланк попыток (3 подхода)', 'attemptSheet'],
    ['reports-tab-blanks', 'Бланк решения судей', 'judgeDecisionBlank'],
    ['reports-tab-blanks', 'Бланк протокола ВК', 'protocolVkBlank'],
    ['reports-tab-nominations', 'Все номинации', 'nominationsAll'],
    ['reports-tab-nominations', 'По группам', 'nominationsByGroups'],
    ['reports-tab-nominations', 'По помостам', 'nominationsByPlatforms'],
    ['reports-tab-judges', 'Печать назначения судей', 'judgeAssignments'],
    ['reports-tab-judges', 'Печать назначения судей (English)', 'judgeAssignmentsEn'],
    ['reports-tab-cards', 'Карточки A4', 'athleteCardsA4'],
    ['reports-tab-cards', 'Карточки A5 на 2 на лист', 'athleteCardsA5'],
    ['reports-tab-cards', 'Карточки только взвешенных', 'athleteCardsWeighedIn'],
    ['reports-tab-schedule', 'Полное расписание', 'scheduleFull'],
    ['reports-tab-schedule', 'По помостам', 'schedulePlatforms'],
    ['reports-tab-schedule', 'По группам', 'scheduleGroups'],
    ['reports-tab-references', 'Справка об участии', 'participationReferences'],
    ['reports-tab-references', 'Благодарственное письмо', 'thankYouLetters'],
  ] as const) {
    await expectPrintablePreview(page, action[0], action[1], action[2]);
  }

  await page.getByTestId('reports-tab-judges').click();
  await expect(
    page.getByRole('button', { name: 'Печать кодов быстрой авторизации в телеграм' }),
  ).toBeDisabled();
});
