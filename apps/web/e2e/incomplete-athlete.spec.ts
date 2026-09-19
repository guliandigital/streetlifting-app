import { expect, test } from '@playwright/test';
import { installFreshAuth } from './helpers/auth.js';

test('create a year-only athlete and complete the profile', async ({ page }) => {
  await installFreshAuth(page);
  await page.goto('/athletes/new');
  await page.locator('#lastName').fill(`Incomplete${Date.now()}`);
  await page.locator('#firstName').fill('Profile');
  await page.locator('#birthYear').fill('2006');
  await expect(page.locator('#dateOfBirth')).toHaveValue('');
  await expect(page.locator('#countryCode')).toHaveValue('');
  await page.getByRole('button', { name: /^(Сохранить|Save)$/ }).click();
  await expect(page).toHaveURL(/\/athletes\/(?!new)[^/]+$/);
  await expect(page.locator('dd').filter({ hasText: /^2006$/ })).toBeVisible();
  await page.getByRole('button', { name: /Включить возможность редактирования/ }).click();
  await page.locator('#dateOfBirth').fill('2006-06-12');
  await page.locator('#countryCode').selectOption('AM');
  await page.getByRole('button', { name: /^(Сохранить|Save)$/ }).click();
  await expect(page.locator('dd').filter({ hasText: /12.06.2006/ })).toBeVisible();
  await page.reload();
  await expect(page.locator('dd').filter({ hasText: /12.06.2006/ })).toBeVisible();
});
