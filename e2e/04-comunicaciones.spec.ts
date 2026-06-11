import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsResident } from './helpers';

test.describe('Comunicaciones', () => {
  test('cartelera page loads for resident', async ({ page }) => {
    await loginAsResident(page);
    await page.goto('/cartelera', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('admin-novedades page loads for admin', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin-novedades');
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/login/);
  });
});
