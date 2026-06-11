import { test, expect } from '@playwright/test';
import { loginAsResident } from './helpers';

test.describe('Profile', () => {
  test('profile page shows user info', async ({ page }) => {
    await loginAsResident(page);
    await page.goto('/perfil');
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/login/);
    const body = await page.textContent('body');
    expect(body).toContain('Residente Demo');
  });
});
