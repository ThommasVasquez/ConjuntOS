import { test, expect } from '@playwright/test';
import { loginAsResident, loginAsAdmin } from './helpers';

test.describe('Chat', () => {
  test('admin chat inbox loads', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin-mensajes');
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/login/);
  });
});
