import { expect, test, type Locator, type Page } from '@playwright/test';

const REFRESH_KEY = 'streetlifting.refresh.v1';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((refreshKey) => {
    const sessionRefresh = window.sessionStorage.getItem(refreshKey);
    const storedRefresh = window.localStorage.getItem(refreshKey);
    if (sessionRefresh) {
      window.localStorage.setItem(refreshKey, sessionRefresh);
    } else if (storedRefresh) {
      window.sessionStorage.setItem(refreshKey, storedRefresh);
    }
  }, REFRESH_KEY);
});

function idFromUrl(url: string, segment: string): string {
  const match = new RegExp(`/${segment}/(?!new(?:[/?#]|$))([^/?#]+)`).exec(url);
  if (!match?.[1]) throw new Error(`Could not read ${segment} id from ${url}`);
  return match[1];
}

async function fillText(page: Page, selector: string, value: string): Promise<void> {
  await page.locator(selector).fill(value);
}

async function submitAndReadId(page: Page, segment: string): Promise<string> {
  await page.getByRole('button', { name: /^(Сохранить|Save)$/ }).click();
  await expect(page).toHaveURL(new RegExp(`/${segment}/(?!new(?:[/?#]|$))[^/?#]+`));
  return idFromUrl(page.url(), segment);
}

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
  expect(response.ok()).toBe(true);
}

async function nominationRow(page: Page, athleteLastName: string): Promise<Locator> {
  const row = page.getByTestId('nomination-row').filter({ hasText: athleteLastName });
  await expect(row).toBeVisible();
  return row;
}

test('pilot secretary create/edit flow after persisted auth state', async ({ page }) => {
  const suffix = Date.now().toString(36).slice(-7).toUpperCase();
  const federationCode = `PW${suffix}`;
  const competitionCode = `PWE2E${suffix}`;
  const athleteLastName = `E2E${suffix}`;
  const judgeLastName = `Judge${suffix}`;

  await page.goto('/federations/new');
  await fillText(page, '#code', federationCode);
  await fillText(page, '#nameRu', `E2E федерация ${suffix}`);
  await fillText(page, '#nameEn', `E2E Federation ${suffix}`);
  await fillText(page, '#tariffRub', '50');
  const federationId = await submitAndReadId(page, 'federations');

  await page.goto('/competitions/new');
  await page.locator('#federationId').selectOption(federationId);
  await fillText(page, '#code', competitionCode);
  await fillText(page, '#timezone', 'Asia/Yerevan');
  await fillText(page, '#nameRu', `E2E пилот ${suffix}`);
  await fillText(page, '#nameEn', `E2E Pilot ${suffix}`);
  await fillText(page, '#startDate', '2026-06-01');
  await fillText(page, '#endDate', '2026-06-01');
  await fillText(page, '#city', 'Yerevan');
  await fillText(page, '#venue', 'E2E Hall');
  await fillText(page, '#entryFeeRub', '1500');
  const competitionId = await submitAndReadId(page, 'competitions');

  await page.goto('/athletes/new');
  await fillText(page, '#lastName', athleteLastName);
  await fillText(page, '#firstName', 'Pilot');
  await fillText(page, '#dateOfBirth', '1996-01-01');
  await fillText(page, '#city', 'Yerevan');
  await fillText(page, '#clubName', 'E2E Club');
  const athleteId = await submitAndReadId(page, 'athletes');

  await page.goto('/judges/new');
  await fillText(page, '#lastName', judgeLastName);
  await fillText(page, '#firstName', 'Secretary');
  const judgeId = await submitAndReadId(page, 'judges');

  const opsLoad = page.waitForResponse((item) =>
    item.url().includes(`/competitions/${competitionId}/ops`),
  );
  await page.goto(`/competitions/${competitionId}/operations`);
  const opsLoadResponse = await opsLoad;
  expect(opsLoadResponse.ok(), await opsLoadResponse.text()).toBe(true);
  await expect(page.getByTestId('competition-ops')).toBeVisible();

  await clickAndWaitForApi(page, 'POST', `/competitions/${competitionId}/setup/default`, () =>
    page.getByTestId('ops-apply-setup').click(),
  );

  const judgesList = page.waitForResponse((item) => item.url().includes('/judges?limit=200'));
  await page.getByTestId('ops-tab-judges').click();
  const judgesListResponse = await judgesList;
  expect(judgesListResponse.ok(), await judgesListResponse.text()).toBe(true);
  await expect(page.getByTestId('judge-assignment-panel')).toBeVisible();
  const judgesSearch = page.waitForResponse(
    (item) => item.url().includes('/judges?') && item.url().includes(`search=${judgeLastName}`),
  );
  await page.getByTestId('judge-assignment-search').fill(judgeLastName);
  const judgesSearchResponse = await judgesSearch;
  const judgesSearchText = await judgesSearchResponse.text();
  expect(judgesSearchResponse.ok(), judgesSearchText).toBe(true);
  expect(judgesSearchText).toContain(judgeId);
  await page.getByTestId('judge-assignment-judge').selectOption(judgeId);
  await page.getByTestId('judge-assignment-role').selectOption('head');
  await clickAndWaitForApi(page, 'POST', `/competitions/${competitionId}/judge-assignments`, () =>
    page.getByTestId('judge-assignment-create').click(),
  );
  await expect(page.getByTestId('judge-assignment-row')).toContainText(judgeLastName);

  const athletesList = page.waitForResponse((item) => item.url().includes('/athletes?limit=200'));
  await page.getByTestId('ops-tab-nominations').click();
  const athletesListResponse = await athletesList;
  const athletesListText = await athletesListResponse.text();
  expect(athletesListResponse.ok(), athletesListText).toBe(true);
  expect(athletesListText).toContain(athleteId);
  await expect(page.getByTestId('nomination-create-form')).toBeVisible();
  await page.getByTestId('nomination-athlete').selectOption(athleteId);
  await page
    .getByTestId('nomination-discipline')
    .selectOption({ label: 'Классическое подтягивание' });
  await clickAndWaitForApi(page, 'POST', `/competitions/${competitionId}/nominations`, () =>
    page.getByTestId('nomination-submit').click(),
  );
  await expect(page.getByTestId('nominations-table')).toContainText(athleteLastName);
  await page.getByTestId('nomination-filter-search').fill(athleteLastName);
  await expect(page.getByTestId('nominations-table')).toContainText(athleteLastName);
  await page.getByTestId('nomination-filter-search').fill('');

  await page.getByTestId('ops-tab-setup').click();
  await clickAndWaitForApi(page, 'POST', `/competitions/${competitionId}/nominations/draw`, () =>
    page.getByTestId('ops-draw-numbers').click(),
  );
  await clickAndWaitForApi(page, 'POST', `/competitions/${competitionId}/flights/auto-plan`, () =>
    page.getByTestId('ops-auto-plan').click(),
  );

  await page.getByTestId('ops-tab-flights').click();
  await expect(page.getByTestId('flight-bulk-assignment')).toBeVisible();
  await expect(page.getByTestId('flight-bulk-assign')).toBeEnabled();
  const selectedGroupId = await page
    .getByTestId('flight-bulk-group')
    .evaluate((select) => (select as HTMLSelectElement).value);
  await clickAndWaitForApi(page, 'PATCH', `/nominations/`, () =>
    page.getByTestId('flight-bulk-assign').click(),
  );
  await expect(page.getByTestId('flight-unassigned-count')).toContainText('0');
  const flightRow = await nominationRow(page, athleteLastName);
  await expect(page.getByTestId(`flight-group-drop-${selectedGroupId}`)).toBeVisible();
  const nominationId = await flightRow.getAttribute('data-nomination-id');
  expect(nominationId).toBeTruthy();
  await expect(flightRow.getByTestId('nomination-row-drag-handle')).toBeVisible();
  await clickAndWaitForApi(page, 'PATCH', `/nominations/`, () =>
    page.evaluate(
      ({ groupId, nominationId: draggedNominationId }) => {
        const target = document.querySelector(`[data-testid="flight-group-drop-${groupId}"]`);
        if (!target) throw new Error(`Drop target not found: ${groupId}`);
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('application/x-nomination-id', draggedNominationId);
        dataTransfer.setData('text/plain', draggedNominationId);
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
      },
      { groupId: selectedGroupId, nominationId: nominationId ?? '' },
    ),
  );

  await page.getByTestId('ops-tab-mandate').click();
  const row = await nominationRow(page, athleteLastName);
  await row.getByTestId('nomination-row-body-weight').fill('82.4');
  await expect(row.getByTestId('nomination-row-auto-weight-class')).toContainText('82.5');
  const selectedWeightClass = await row
    .getByTestId('nomination-row-weight-class')
    .evaluate((select) => (select as HTMLSelectElement).selectedOptions[0]?.textContent ?? '');
  expect(selectedWeightClass).toContain('82.5');
  await row.getByTestId('nomination-row-payment-status').selectOption('paid');
  await row.getByTestId('nomination-row-paid-amount').fill('1500');
  await row.getByTestId('nomination-row-payment-method').selectOption('cash');
  await row.getByTestId('nomination-row-mandate').check();
  await clickAndWaitForApi(page, 'PATCH', `/nominations/`, () =>
    row.getByTestId('nomination-row-save').click(),
  );

  await page.getByTestId('ops-tab-attempts').click();
  const attemptRow = page.getByTestId('attempt-row').filter({ hasText: athleteLastName });
  await expect(attemptRow).toBeVisible();
  await attemptRow.getByTestId('attempt-weight').fill('30');
  await attemptRow.getByTestId('attempt-result').selectOption('good_lift');
  await clickAndWaitForApi(page, 'PUT', `/nominations/`, () =>
    attemptRow.getByTestId('attempt-save').click(),
  );
  await expect(attemptRow.getByTestId('attempt-summary')).toContainText('30');

  await page.getByTestId('ops-tab-scoreboard').click();
  await expect(page.getByTestId('scoreboard-table')).toContainText(athleteLastName);
  await expect(page.getByTestId('scoreboard-table')).toContainText('30');

  await page.goto(`/competitions/${competitionId}/operator`);
  await expect(page.getByTestId('competition-operator')).toBeVisible();
  await expect(page.getByTestId('operator-nomination')).toBeVisible();

  await page.goto(`/competitions/${competitionId}/judge`);
  await expect(page.getByTestId('competition-judge')).toBeVisible();
  await expect(page.getByTestId('judge-nomination')).toBeVisible();

  await page.goto(`/competitions/${competitionId}/protocol-print`);
  await expect(page.getByTestId('protocol-print')).toContainText(athleteLastName);

  await page.goto(`/competitions/${competitionId}/operations`);
  await page.getByTestId('ops-tab-exports').click();
  const protocolDownload = page.waitForEvent('download');
  await page.getByTestId('ops-export-protocol').click();
  expect((await protocolDownload).suggestedFilename()).toContain('protocol');
  const protocolXlsxDownload = page.waitForEvent('download');
  await page.getByTestId('ops-export-protocol-xlsx').click();
  expect((await protocolXlsxDownload).suggestedFilename()).toContain('protocol');
  const accountingDownload = page.waitForEvent('download');
  await page.getByTestId('ops-export-accounting').click();
  expect((await accountingDownload).suggestedFilename()).toContain('accounting');
  const accountingXlsxDownload = page.waitForEvent('download');
  await page.getByTestId('ops-export-accounting-xlsx').click();
  expect((await accountingXlsxDownload).suggestedFilename()).toContain('accounting');
});
