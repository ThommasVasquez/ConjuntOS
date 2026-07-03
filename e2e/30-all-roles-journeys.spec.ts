import { test, expect } from '@playwright/test';
import { ALL_ROLES, NAV_TABS, routesForRole, DEMO_ACCOUNTS, type Rol } from './roles';
import {
  loginTester, loginAs, switchTo, assertRendered, exerciseFormsCapped, clickNavTabs, collectErrors,
} from './journey-helpers';

/**
 * Full role coverage — all 13 roles, driven through the REAL UI.
 *
 * One tester account (admin@demo, whitelisted in TESTER_EMAILS) logs in once and
 * switches its real server-side role for each role under test. For every role it:
 *   1. lands on the role's home and asserts it rendered (no /login bounce, no crash)
 *   2. clicks every bottom-nav menu tab and asserts each navigates cleanly
 *   3. visits every route the role can reach, asserting render + no console errors
 *   4. opens create-forms, fills them, and cancels (SUBMIT=1 to actually submit)
 *
 * Needs the local stack (frontend :3000 + backend :8080 with the e2e cookie/tester
 * override — docker-compose.e2e.yml). Run:
 *   pnpm playwright test 30-all-roles-journeys
 *   SUBMIT=1 pnpm playwright test 30-all-roles-journeys   # also submits forms
 */

test.describe('Todos los roles — recorrido completo de la UI', () => {
  test.beforeEach(({ page }) => {
    // native confirm()/alert() must not block the run
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
  });

  // The tester account's REAL role is mutated by switchTo(). Restore it to
  // ADMINISTRADOR afterwards so other specs that log in as admin@demo (the
  // documented ADMINISTRADOR demo account) see the expected role.
  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    try {
      await ctx.request.post('/api/v1/auth/login', { data: { email: 'admin@demo.conjuntos.app', password: '123456789' } });
      await ctx.request.post('/api/v1/auth/switch-role', { data: { rol: 'ADMINISTRADOR' } });
    } finally {
      await ctx.close();
    }
  });

  for (const role of ALL_ROLES) {
    test(`${role} — menús, vistas y formularios`, async ({ page }) => {
      // Heavier roles visit ~20 views; first run compiles each route on-demand.
      test.setTimeout(300_000);
      const getErrors = collectErrors(page);

      // SUPER_ADMIN can no longer be switched into (privilege-escalation guard),
      // so exercise it via its dedicated account; all other roles via the tester.
      if (role === 'SUPER_ADMIN') {
        await loginAs(page, DEMO_ACCOUNTS.SUPER_ADMIN);
      } else {
        await loginTester(page);
        await switchTo(page, role as Rol);
      }

      // 1. Land on home
      await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
      await assertRendered(page, `${role} /inicio`);

      // 2. Click every bottom-nav menu tab
      await clickNavTabs(page, NAV_TABS[role as Rol]);
      if (process.env.TRACE_ROUTES) console.log(`⏱ ${role} navTabs done`);

      // 3. Visit every reachable route + exercise forms
      let formsOpened = 0;
      for (const { route, label } of routesForRole(role as Rol)) {
        const t0 = Date.now();
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await assertRendered(page, `${role} ${label} (${route})`);
        formsOpened += await exerciseFormsCapped(page);
        if (process.env.TRACE_ROUTES) console.log(`⏱ ${role} ${route} ${Date.now() - t0}ms`);
      }

      // 4. No uncaught client errors across the whole journey
      const errors = getErrors();
      expect(errors, `${role}: uncaught client errors:\n${errors.join('\n')}`).toEqual([]);

      console.log(`✅ ${role}: ${routesForRole(role as Rol).length} vistas, ${formsOpened} formularios abiertos`);
    });
  }
});
