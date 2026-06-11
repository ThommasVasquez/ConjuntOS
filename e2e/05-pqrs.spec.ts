import { test, expect } from '@playwright/test';
import { loginAsResident } from './helpers';

test.describe('PQRS', () => {
  test('pqrs page loads', async ({ page }) => {
    await loginAsResident(page);
    await page.goto('/pqrs', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/login/);
  });
});
