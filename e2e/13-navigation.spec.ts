import { test, expect } from '@playwright/test';
import { loginAsResident, loginAsAdmin } from './helpers';

const residentPages = [
  '/inicio', '/perfil', '/pagos', '/reservas', '/cartelera',
  '/clasificados', '/pqrs', '/citofonia', '/visitantes',
  '/parqueadero', '/inmobiliaria',
];

const adminPages = [
  '/admin-novedades', '/admin-mensajes', '/admin-finanzas',
];

test.describe('Resident Navigation Smoke', () => {
  for (const path of residentPages) {
    test(`loads ${path}`, async ({ page }) => {
      await loginAsResident(page);
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      await expect(page).not.toHaveURL(/\/login/);
    });
  }
});

test.describe('Admin Navigation Smoke', () => {
  for (const path of adminPages) {
    test(`loads ${path}`, async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      await expect(page).not.toHaveURL(/\/login/);
    });
  }
});
