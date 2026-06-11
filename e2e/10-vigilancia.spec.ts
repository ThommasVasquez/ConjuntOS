import { test, expect } from '@playwright/test';
import { loginAsResident } from './helpers';

test.describe('Vigilancia Pages', () => {
  test('visitantes page loads', async ({ page }) => {
    await loginAsResident(page);
    await page.goto('/visitantes');
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('parqueadero page loads', async ({ page }) => {
    await loginAsResident(page);
    await page.goto('/parqueadero');
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('citofonia page loads', async ({ page }) => {
    await loginAsResident(page);
    await page.goto('/citofonia');
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/login/);
  });
});
