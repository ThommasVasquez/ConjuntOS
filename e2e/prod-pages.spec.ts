import { test, expect } from '@playwright/test';
import { PAGES, CREDS } from './pages';

/**
 * Every page on the REAL production frontend (https://app.conjuntos.app),
 * one per role. READ-ONLY by design: logs in, opens the view, verifies it
 * renders for a real user (not bounced to /login, real content, no crashed
 * error boundary), and fills visible inputs — but NEVER submits forms or
 * clicks mutating action buttons, so it cannot create/alter prod data or
 * notify real residents.
 *
 * Login hits api.conjuntos.app directly; the ec_session cookie is scoped to
 * .conjuntos.app (COOKIE_DOMAIN), so it's carried to app.conjuntos.app.
 *
 * For full interaction (clicks + form submits) use realistic-journeys against
 * a LOCAL/staging stack — do NOT submit forms against prod.
 *
 * Run:  pnpm playwright test prod-pages --workers=2
 */
const APP = 'https://app.conjuntos.app';
const API = 'https://api.conjuntos.app/api/v1';

test.describe('Prod pages — real domain, read-only render check', () => {
  test.describe.configure({ retries: 1 });

  test.beforeEach(({ page }) => { page.on('dialog', (d) => d.dismiss().catch(() => {})); });

  for (const { route, role, label } of PAGES) {
    test(`${role} · ${label} (${route})`, async ({ page }) => {
      test.setTimeout(60_000);

      // login against the API (sets .conjuntos.app cookie for the whole context)
      const res = await page.request.post(`${API}/auth/login`, { data: CREDS[role], timeout: 30_000 });
      expect(res.ok(), `login ${role} → ${res.status()}`).toBeTruthy();

      // open the real page
      await page.goto(`${APP}${route}`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

      // it rendered as the right page for a real user
      await expect(page, 'should not bounce to /login').not.toHaveURL(/\/login/);
      const body = (await page.textContent('body').catch(() => '')) || '';
      expect(body.length, 'page should render real content').toBeGreaterThan(50);
      expect(body, 'no crashed error boundary').not.toMatch(/Application error|Unhandled Runtime Error|Something went wrong/i);

      // fill visible inputs (form state only — no submit, no action clicks)
      const inputs = page.locator(
        'input:visible:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([disabled]):not([readonly]), textarea:visible:not([disabled]):not([readonly])'
      );
      const n = Math.min(await inputs.count().catch(() => 0), 6);
      for (let i = 0; i < n; i++) {
        await inputs.nth(i).fill('Prueba E2E', { timeout: 2000 }).catch(() => {});
      }

      await expect(page.locator('body')).toBeVisible();
    });
  }
});
