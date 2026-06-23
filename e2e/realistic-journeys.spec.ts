import { test, expect, Page } from '@playwright/test';
import { login } from './helpers';
import { PAGES, CREDS } from './pages';

/**
 * Realistic user journeys — behaves like a real person, not a smoke test.
 * For every page of every role it: logs in, opens the view, waits for it to
 * render, then exercises the UI — opens forms, fills visible inputs with
 * sample data, and (by default) cancels instead of submitting so it doesn't
 * pollute the DB. Set SUBMIT=1 to actually submit forms.
 *
 * Runs against baseURL (playwright.config.ts → http://localhost:3000), so it
 * needs the local stack up (frontend + backend + seeded demo accounts).
 * It is intentionally NOT pointed at prod: clicking/filling writes data.
 *
 * Run:  pnpm playwright test realistic-journeys
 *       SUBMIT=1 pnpm playwright test realistic-journeys   # also submits forms
 */

const DESTRUCTIVE = /eliminar|borrar|delete|cerrar sesi|salir|logout|anular|revocar|rechazar|remove|desactivar/i;
const OPENERS = /nuevo|crear|agregar|añadir|registrar|reportar|solicitar|reservar|invitar|abrir|publicar|\+/i;

async function fillVisibleInputs(page: Page) {
  const inputs = page.locator(
    'input:visible:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([disabled]):not([readonly]), textarea:visible:not([disabled]):not([readonly])'
  );
  const n = Math.min(await inputs.count(), 8);
  for (let i = 0; i < n; i++) {
    const el = inputs.nth(i);
    const type = (await el.getAttribute('type').catch(() => '')) || 'text';
    const val =
      type === 'email' ? 'prueba.e2e@demo.conjuntos.app' :
      type === 'number' ? '5' :
      type === 'tel' ? '3001234567' :
      type === 'date' ? '2026-07-15' :
      type === 'time' ? '10:00' :
      type === 'password' ? 'Prueba12345' :
      'Prueba E2E — uso real';
    await el.fill(val, { timeout: 2000 }).catch(() => {});
  }
}

/** Open forms, fill them, then cancel (or submit if SUBMIT=1). */
async function exercise(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(800);

  // fill any inline inputs (search bars, filters)
  await fillVisibleInputs(page);

  const openers = page.getByRole('button', { name: OPENERS });
  const count = Math.min(await openers.count().catch(() => 0), 3);
  for (let i = 0; i < count; i++) {
    const btn = openers.nth(i);
    const name = (await btn.textContent().catch(() => '')) || '';
    if (DESTRUCTIVE.test(name)) continue;
    if (!(await btn.isVisible().catch(() => false))) continue;
    await btn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(700);
    await fillVisibleInputs(page);

    if (process.env.SUBMIT) {
      const submit = page.getByRole('button', { name: /guardar|enviar|crear|confirmar|publicar|reservar|registrar/i }).first();
      await submit.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1000);
    }
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
  }
}

test.describe('Realistic journeys — open views, click, fill', () => {
  // native confirm()/alert() must not block the run
  test.beforeEach(({ page }) => {
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
  });

  for (const { route, role, label } of PAGES) {
    test(`${role} · ${label} (${route})`, async ({ page }) => {
      await login(page, CREDS[role].email, CREDS[role].password);
      await page.goto(route, { waitUntil: 'domcontentloaded' });

      // it actually rendered as the right page, not bounced to login
      await expect(page, 'should not be redirected to /login').not.toHaveURL(/\/login/);
      const body = (await page.textContent('body').catch(() => '')) || '';
      expect(body.length, 'page should render real content').toBeGreaterThan(50);
      expect(body, 'no crashed error boundary').not.toMatch(/Application error|Unhandled Runtime Error|Something went wrong/i);

      // behave like a user
      await exercise(page);

      // still alive after interaction (no white-screen crash)
      await expect(page.locator('body')).toBeVisible();
    });
  }
});
