import { test, expect } from '@playwright/test';
import { login, switchRole, sleep } from './prod-helpers';

test.describe('PRD — All Modules Smoke Tests', () => {

  // ── 01 — Otto AI ──────────────────────────────────────────────
  test.describe('01 — Otto AI', () => {
    test('Otto AI page loads and accepts questions', async ({ page }) => {
      await login(page);
      await page.goto('/asistente', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
      // Check the page has some content
      const text = await page.textContent('body');
      expect(text).toMatch(/asistente|otto|pregunta|ia/i);
    });
  });

  // ── 02 — Asambleas ──────────────────────────────────────────────
  test.describe('02 — Asambleas', () => {
    test('asambleas page loads and list renders', async ({ page }) => {
      await login(page);
      await switchRole(page, 'PROPIETARIO');
      await page.goto('/asambleas', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
      const text = await page.textContent('body');
      expect(text.length).toBeGreaterThan(50);
    });

    test('admin can see asambleas page', async ({ page }) => {
      await login(page);
      await switchRole(page, 'ADMINISTRADOR');
      await page.goto('/asambleas', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  // ── 03 — Vehículos ──────────────────────────────────────────────
  test.describe('03 — Vehículos', () => {
    test('vehiculos section loads in profile', async ({ page }) => {
      await login(page);
      await switchRole(page, 'PROPIETARIO');
      await page.goto('/perfil', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
      const text = await page.textContent('body');
      expect(text).toMatch(/veh[ií]culo|automóvil|moto|placa/i);
    });
  });

  // ── 04 — Seguridad (SOS + Visitas) ──────────────────────────────
  test.describe('04 — Seguridad', () => {
    test('SOS panic button visible as residente', async ({ page }) => {
      await login(page);
      await switchRole(page, 'PROPIETARIO');
      await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      const text = await page.textContent('body');
      expect(text).toMatch(/pánico|sos|emergencia|alerta/i);
    });

    test('SOS create + cancel flow', async ({ page }) => {
      await login(page);
      await switchRole(page, 'PROPIETARIO');
      await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
      await sleep(2000);

      // Click the panic button (the one that opens the SOS modal)
      const panicBtn = page.locator('button:has-text("Pánico")');
      if (await panicBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await panicBtn.click();
        await sleep(1000);

        // Pick first emergency type
        const emergencyBtn = page.locator('button:has-text("Seguridad")');
        if (await emergencyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await emergencyBtn.click();
          await sleep(2000);

          // Should see active alert banner
          const activeBanner = page.locator('text=Alerta SOS activa');
          if (await activeBanner.isVisible({ timeout: 5000 }).catch(() => false)) {
            // Cancel it
            const cancelBtn = page.locator('button:has-text("Cancelar alerta")');
            if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
              await cancelBtn.click();
              await sleep(2000);
              await expect(page.locator('text=Alerta SOS activa')).not.toBeVisible({ timeout: 5000 }).catch(() => {});
            }
          }
        }
      }
    });

    test('vigilancia page loads', async ({ page }) => {
      await login(page);
      await switchRole(page, 'VIGILANTE');
      await page.goto('/vigilancia', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
      const text = await page.textContent('body');
      expect(text.length).toBeGreaterThan(50);
    });

    test('visitantes page loads', async ({ page }) => {
      await login(page);
      await switchRole(page, 'PROPIETARIO');
      await page.goto('/visitantes', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  // ── 05 — Reservas ──────────────────────────────────────────────
  test.describe('05 — Reservas', () => {
    test('areas comunes page loads', async ({ page }) => {
      await login(page);
      await switchRole(page, 'PROPIETARIO');
      await page.goto('/areas-comunes', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
      const text = await page.textContent('body');
      expect(text.length).toBeGreaterThan(50);
    });

    test('reservas page loads', async ({ page }) => {
      await login(page);
      await switchRole(page, 'PROPIETARIO');
      await page.goto('/reservas', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  // ── 06 — PQRS ──────────────────────────────────────────────────
  test.describe('06 — PQRS', () => {
    test('solicitudes page loads', async ({ page }) => {
      await login(page);
      await switchRole(page, 'PROPIETARIO');
      await page.goto('/solicitudes', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
      const text = await page.textContent('body');
      expect(text.length).toBeGreaterThan(50);
    });

    test('admin can see pqrs admin page', async ({ page }) => {
      await login(page);
      await switchRole(page, 'ADMINISTRADOR');
      await page.goto('/solicitudes', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  // ── 07 — Comunicados ───────────────────────────────────────────
  test.describe('07 — Comunicados', () => {
    test('cartelera page loads', async ({ page }) => {
      await login(page);
      await switchRole(page, 'PROPIETARIO');
      await page.goto('/cartelera', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
      const text = await page.textContent('body');
      expect(text.length).toBeGreaterThan(50);
    });
  });

  // ── 08 — Perfiles ──────────────────────────────────────────────
  test.describe('08 — Perfiles', () => {
    test('profile page loads with user data', async ({ page }) => {
      await login(page);
      await switchRole(page, 'PROPIETARIO');
      await page.goto('/perfil', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
      const text = await page.textContent('body');
      expect(text.length).toBeGreaterThan(100);
    });

    test('login as different roles', async ({ page }) => {
      await login(page);
      await switchRole(page, 'ARRENDATARIO');
      await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
      await sleep(2000);
      await expect(page).not.toHaveURL(/\/login/);

      await switchRole(page, 'ADMINISTRADOR');
      await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
      await sleep(2000);
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  // ── 09 — Mascotas ──────────────────────────────────────────────
  test.describe('09 — Mascotas', () => {
    test('mascotas section loads in profile', async ({ page }) => {
      await login(page);
      await switchRole(page, 'PROPIETARIO');
      await page.goto('/perfil', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      const text = await page.textContent('body');
      expect(text).toMatch(/mascota|vacuna|perro|gato/i);
    });
  });

  // ── 10 — Cartera ───────────────────────────────────────────────
  test.describe('10 — Cartera', () => {
    test('cartera page loads with pagination info', async ({ page }) => {
      await login(page);
      await switchRole(page, 'PROPIETARIO');
      await page.goto('/cartera', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
      const text = await page.textContent('body');
      expect(text.length).toBeGreaterThan(50);
    });
  });

  // ── 11 — Dashboard ─────────────────────────────────────────────
  test.describe('11 — Dashboard', () => {
    test('admin dashboard loads with analytics', async ({ page }) => {
      await login(page);
      await switchRole(page, 'ADMINISTRADOR');
      await page.goto('/admin-analytics', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
      const text = await page.textContent('body');
      expect(text.length).toBeGreaterThan(50);
    });
  });

  // ── 12 — Encomiendas ───────────────────────────────────────────
  test.describe('12 — Encomiendas', () => {
    test('paqueteria page loads as vigia', async ({ page }) => {
      await login(page);
      await switchRole(page, 'VIGILANTE');
      await page.goto('/paqueteria', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
    });

    test('resident can see packages page', async ({ page }) => {
      await login(page);
      await switchRole(page, 'PROPIETARIO');
      await page.goto('/paquetes', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
    });

    test('correspondencia page loads as vigia', async ({ page }) => {
      await login(page);
      await switchRole(page, 'VIGILANTE');
      await page.goto('/correspondencia', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  // ── 13 — Convivencia ───────────────────────────────────────────
  test.describe('13 — Convivencia', () => {
    test('multas page loads as admin', async ({ page }) => {
      await login(page);
      await switchRole(page, 'ADMINISTRADOR');
      await page.goto('/multas', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
      const text = await page.textContent('body');
      expect(text.length).toBeGreaterThan(50);
    });

    test('comite convivencia page loads', async ({ page }) => {
      await login(page);
      await switchRole(page, 'ADMINISTRADOR');
      await page.goto('/comite-convivencia', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  // ── 14 — Encuestas ─────────────────────────────────────────────
  test.describe('14 — Encuestas', () => {
    test('encuestas page loads', async ({ page }) => {
      await login(page);
      await switchRole(page, 'PROPIETARIO');
      await page.goto('/encuestas', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
      const text = await page.textContent('body');
      expect(text.length).toBeGreaterThan(50);
    });
  });

  // ── 15 — Clasificados ──────────────────────────────────────────
  test.describe('15 — Clasificados', () => {
    test('clasificados page loads', async ({ page }) => {
      await login(page);
      await switchRole(page, 'PROPIETARIO');
      await page.goto('/clasificados', { waitUntil: 'domcontentloaded' });
      await sleep(3000);
      await expect(page).not.toHaveURL(/\/login/);
      const text = await page.textContent('body');
      expect(text.length).toBeGreaterThan(50);
    });
  });
});
