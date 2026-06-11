import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsResident } from './helpers';

test.describe('Dashboard', () => {
  test('resident dashboard loads', async ({ page }) => {
    await loginAsResident(page);
    // Wait for client-side hydration and API data to render
    await expect(page.locator('body')).toContainText('Residente Demo', { timeout: 15000 });
  });

  test('admin dashboard loads', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.locator('body')).toContainText('Admin Demo', { timeout: 15000 });
  });
});
