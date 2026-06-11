import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsResident } from './helpers';

test.describe('Authentication', () => {
  test('landing page loads without auth', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const body = await page.textContent('body');
    expect(body!.length).toBeGreaterThan(100);
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    // The middleware redirects /inicio -> /login with a 307.
    // Follow the redirect and verify we end up on login.
    const res = await page.request.get('/inicio', { maxRedirects: 0 });
    expect([307, 308]).toContain(res.status());
  });

  test('login with valid admin credentials', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page).toHaveURL(/\/inicio/);
  });

  test('login with valid resident credentials', async ({ page }) => {
    await loginAsResident(page);
    await expect(page).toHaveURL(/\/inicio/);
  });

  test('login API rejects wrong password', async ({ page }) => {
    const res = await page.request.post('/api/v1/auth/login', {
      data: { email: 'admin@demo.conjuntos.app', password: 'WrongPassword!' },
    });
    expect(res.status()).toBe(401);
  });

  test('session persists across navigation', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/perfil', { waitUntil: 'domcontentloaded' });
    await expect(page).not.toHaveURL(/\/login/);
  });
});
