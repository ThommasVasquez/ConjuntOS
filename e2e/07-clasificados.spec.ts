import { test, expect } from '@playwright/test';
import { loginAsResident } from './helpers';

test.describe('Clasificados', () => {
  test('clasificados page loads', async ({ page }) => {
    await loginAsResident(page);
    await page.goto('/clasificados');
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/login/);
  });
});
