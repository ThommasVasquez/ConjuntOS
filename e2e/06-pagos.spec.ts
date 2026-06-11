import { test, expect } from '@playwright/test';
import { loginAsResident } from './helpers';

test.describe('Pagos', () => {
  test('pagos page loads', async ({ page }) => {
    await loginAsResident(page);
    await page.goto('/pagos');
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/login/);
    const body = await page.textContent('body');
    expect(body!.length).toBeGreaterThan(50);
  });
});
