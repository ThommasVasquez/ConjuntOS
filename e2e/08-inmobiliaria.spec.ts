import { test, expect } from '@playwright/test';
import { loginAsResident } from './helpers';

test.describe('Inmobiliaria', () => {
  test('inmobiliaria page loads', async ({ page }) => {
    await loginAsResident(page);
    await page.goto('/inmobiliaria');
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/login/);
  });
});
