import { test, expect } from '@playwright/test';
import { loginAsResident } from './helpers';

test.describe('Reservas', () => {
  test('reservas page loads', async ({ page }) => {
    await loginAsResident(page);
    await page.goto('/reservas');
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/login/);
  });
});
