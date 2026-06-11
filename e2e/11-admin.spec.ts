import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('Admin Pages', () => {
  test('admin-novedades loads', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin-novedades');
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('admin-mensajes loads', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin-mensajes');
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('admin-finanzas loads', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin-finanzas');
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/login/);
  });
});
