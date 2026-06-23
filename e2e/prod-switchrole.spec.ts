import { test, expect } from '@playwright/test';
import { PAGES } from './pages';

/**
 * Whole-app coverage via switchRole — ONE tester account walks EVERY role.
 *
 * paulo@ is on the tester whitelist (TESTER_EMAILS), so POST /auth/switch-role
 * gives it a fully-real role (DB + JWT), not a simulation. For each role we
 * switch, then open that role's pages on the real prod frontend and verify
 * they render — proving the role-gated UI works end-to-end for every role
 * from a single account.
 *
 * READ-ONLY on prod (login + switch-role + navigation only; no writes).
 *
 * Run:  pnpm playwright test prod-switchrole --workers=1
 */
const APP = 'https://app.conjuntos.app';
const API = 'https://api.conjuntos.app/api/v1';
const PAULO = { email: 'paulo@conjuntos.app', password: 'Md5891129Ae$' };

// enum rol (UPPER_SNAKE, from db/enums.rs) → which page-set that role sees
const ROLE_PLAN: { rol: string; tag: (typeof PAGES)[number]['role'] }[] = [
  { rol: 'PROPIETARIO', tag: 'residente' },
  { rol: 'ARRENDATARIO', tag: 'residente' },
  { rol: 'CONCEJO', tag: 'residente' },
  { rol: 'ADMINISTRADOR', tag: 'admin' },
  { rol: 'VIGILANTE', tag: 'vigilante' },
  { rol: 'SUPERVISOR_VIGILANCIA', tag: 'vigilante' },
  { rol: 'ENCARGADO_PARQUEADERO', tag: 'parqueadero' },
  { rol: 'SUPER_ADMIN', tag: 'superadmin' },
];

test.describe('Whole app via switchRole — every role, one tester account', () => {
  test.describe.configure({ retries: 1 });
  test.beforeEach(({ page }) => { page.on('dialog', (d) => d.dismiss().catch(() => {})); });

  for (const { rol, tag } of ROLE_PLAN) {
    const pages = PAGES.filter((p) => p.role === tag);
    test(`${rol} — ${pages.length} vistas`, async ({ page }) => {
      test.setTimeout(120_000);

      // login + switch to the target role (session re-issued with new rol)
      const login = await page.request.post(`${API}/auth/login`, { data: PAULO, timeout: 30_000 });
      expect(login.ok(), `login paulo → ${login.status()}`).toBeTruthy();
      const sw = await page.request.post(`${API}/auth/switch-role`, { data: { rol }, timeout: 30_000 });
      expect(sw.ok(), `switch-role ${rol} → ${sw.status()}`).toBeTruthy();

      // /auth/me must now report the switched role
      const me = await page.request.get(`${API}/auth/me`);
      const meBody = await me.json().catch(() => ({}));
      expect(JSON.stringify(meBody)).toContain(rol);

      // every page for this role must render on the real frontend
      const broken: string[] = [];
      for (const { route, label } of pages) {
        await page.goto(`${APP}${route}`, { waitUntil: 'domcontentloaded', timeout: 40_000 });
        await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
        const url = page.url();
        const body = (await page.textContent('body').catch(() => '')) || '';
        const ok = !/\/login/.test(url) && body.length > 50 &&
          !/Application error|Unhandled Runtime Error|Something went wrong/i.test(body);
        if (!ok) broken.push(`${label} (${route})`);
      }
      expect(broken, `vistas rotas para ${rol}: ${broken.join(', ')}`).toEqual([]);
      console.log(`   ✅ ${rol}: ${pages.length} vistas OK`);
    });
  }
});
