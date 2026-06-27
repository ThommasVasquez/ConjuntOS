import { test, expect } from '@playwright/test';
import { routesForRole, DEMO_ACCOUNTS, type Rol } from './roles';

/**
 * Screenshot capture — every view, per role.
 *
 * Logs in each standalone demo account (its real server-side role) and screenshots
 * every route that role can reach (routesForRole, the same mapping the role-journey
 * specs use). Saves PNGs to screenshots/<ROL>/<ruta>.png at the repo root.
 *
 * READ-ONLY on prod: login + navigate + screenshot only. It deliberately does NOT
 * use POST /auth/switch-role, which PERSISTS a role change to the DB and cannot
 * restore SUPER_ADMIN — that would mutate prod. The 4 minimal staff roles
 * (PISCINA/GYM/MANTENIMIENTO/LIMPIEZA) and HUESPED_TEMPORAL have no standalone
 * prod account; their views are a subset already captured by the roles below.
 * To capture those 5 as distinct logins, run against the local e2e stack
 * (docker-compose.e2e.yml) where admin@demo is whitelisted for switch-role.
 *
 * Run (prod):  PW_NO_WARM=1 pnpm playwright test e2e/40-screenshots.spec.ts
 * Local stack: PW_NO_WARM=1 PW_BASE_URL=http://localhost:3000 \
 *              PW_API_URL=http://localhost:3000/api/v1 pnpm playwright test e2e/40-screenshots
 */

const APP = process.env.PW_BASE_URL || 'https://app.conjuntos.app';
const API = process.env.PW_API_URL || 'https://api.conjuntos.app/api/v1';
const OUT = 'screenshots';

// Standalone demo accounts → their real role. Login is side-effect-free.
const PLAN: { rol: Rol; creds: { email: string; password: string } }[] = [
  { rol: 'ADMINISTRADOR', creds: DEMO_ACCOUNTS.ADMINISTRADOR },
  { rol: 'PROPIETARIO', creds: DEMO_ACCOUNTS.PROPIETARIO },
  { rol: 'ARRENDATARIO', creds: DEMO_ACCOUNTS.ARRENDATARIO },
  { rol: 'CONCEJO', creds: DEMO_ACCOUNTS.CONCEJO },
  { rol: 'VIGILANTE', creds: DEMO_ACCOUNTS.VIGILANTE },
  { rol: 'SUPERVISOR_VIGILANCIA', creds: DEMO_ACCOUNTS.SUPERVISOR_VIGILANCIA },
  { rol: 'ENCARGADO_PARQUEADERO', creds: DEMO_ACCOUNTS.ENCARGADO_PARQUEADERO },
  { rol: 'SUPER_ADMIN', creds: DEMO_ACCOUNTS.SUPER_ADMIN },
];

const slug = (route: string) => (route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '_'));

test.describe('Screenshots — todas las vistas por rol', () => {
  test.describe.configure({ retries: 1 });
  test.beforeEach(({ page }) => { page.on('dialog', (d) => d.dismiss().catch(() => {})); });

  test('PUBLICO — login', async ({ page }) => {
    await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(700);
    const splash = page.locator('.dots-loader').first();
    if (await splash.count().catch(() => 0)) {
      await splash.waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
    }
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/PUBLICO/login.png`, fullPage: true });
  });

  for (const { rol, creds } of PLAN) {
    const routes = routesForRole(rol);
    test(`${rol} — ${routes.length} vistas`, async ({ page }) => {
      test.setTimeout(240_000);
      const login = await page.request.post(`${API}/auth/login`, { data: creds, timeout: 30_000 });
      expect(login.ok(), `login ${creds.email} → ${login.status()}`).toBeTruthy();

      const warnings: string[] = [];
      for (const { route, label } of routes) {
        try {
          await page.goto(`${APP}${route}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
          // The app renders a full-screen SplashScreen overlay (.dots-loader, ~4s GSAP
          // timeline) on every full load, then unmounts it. Let it mount, then wait
          // for it to detach so we screenshot the REAL view, not the loader.
          await page.waitForTimeout(700);
          const splash = page.locator('.dots-loader').first();
          if (await splash.count().catch(() => 0)) {
            await splash.waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
          }
          await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
          await page.waitForTimeout(1500);
          if (/\/login/.test(page.url())) warnings.push(`${label} (${route}) → rebotó a /login`);
          await page.screenshot({ path: `${OUT}/${rol}/${slug(route)}.png`, fullPage: true });
        } catch (e) {
          warnings.push(`${label} (${route}) → ${(e as Error).message.split('\n')[0]}`);
        }
      }
      console.log(`✅ ${rol}: ${routes.length} vistas` + (warnings.length ? ` — avisos: ${warnings.join('; ')}` : ''));
    });
  }
});
