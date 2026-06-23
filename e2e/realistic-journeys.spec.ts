import { test, expect, Page } from '@playwright/test';
import { login } from './helpers';

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

const CREDS = {
  residente:   { email: 'residente@demo.conjuntos.app',   password: '123456789' },
  admin:       { email: 'admin@demo.conjuntos.app',       password: '123456789' },
  vigilante:   { email: 'vigilante@demo.conjuntos.app',   password: '123456789' },
  parqueadero: { email: 'parqueadero@demo.conjuntos.app', password: '123456789' },
  superadmin:  { email: 'superadmin@demo.conjuntos.app',  password: '123456789' },
} as const;
type Role = keyof typeof CREDS;

// route → role. Every (app) page + root pages.
const PAGES: { route: string; role: Role; label: string }[] = [
  // resident
  { route: '/inicio', role: 'residente', label: 'Dashboard' },
  { route: '/cartelera', role: 'residente', label: 'Cartelera' },
  { route: '/encuestas', role: 'residente', label: 'Encuestas' },
  { route: '/clasificados', role: 'residente', label: 'Clasificados' },
  { route: '/perfil', role: 'residente', label: 'Perfil' },
  { route: '/pagos', role: 'residente', label: 'Pagos / Cartera' },
  { route: '/pqrs', role: 'residente', label: 'PQRS' },
  { route: '/reservas', role: 'residente', label: 'Reservas' },
  { route: '/chat', role: 'residente', label: 'Chat' },
  { route: '/directorio', role: 'residente', label: 'Directorio' },
  { route: '/citofonia', role: 'residente', label: 'Citofonía' },
  { route: '/mi-estancia', role: 'residente', label: 'Mi estancia' },
  { route: '/novedades', role: 'residente', label: 'Novedades' },
  { route: '/pases-temporales', role: 'residente', label: 'Pases temporales' },
  { route: '/inmobiliaria', role: 'residente', label: 'Inmobiliaria' },
  { route: '/comite-convivencia', role: 'residente', label: 'Comité convivencia' },
  { route: '/asistente', role: 'residente', label: 'Asistente IA' },
  { route: '/parqueadero', role: 'residente', label: 'Parqueadero (residente)' },
  { route: '/visitantes', role: 'residente', label: 'Visitantes' },
  // vigilancia
  { route: '/vigilancia', role: 'vigilante', label: 'Vigilancia' },
  { route: '/control-visitas', role: 'vigilante', label: 'Control visitas' },
  { route: '/correspondencia', role: 'vigilante', label: 'Correspondencia' },
  { route: '/paqueteria', role: 'vigilante', label: 'Paquetería' },
  { route: '/novedades-seguridad', role: 'vigilante', label: 'Novedades seguridad' },
  { route: '/seguridad', role: 'vigilante', label: 'Seguridad' },
  // parqueadero
  { route: '/mapa-parqueadero', role: 'parqueadero', label: 'Mapa parqueadero' },
  { route: '/bitacora-parqueadero', role: 'parqueadero', label: 'Bitácora parqueadero' },
  // admin
  { route: '/admin-analytics', role: 'admin', label: 'Admin analytics' },
  { route: '/admin-areas', role: 'admin', label: 'Admin áreas' },
  { route: '/admin-banners', role: 'admin', label: 'Admin banners' },
  { route: '/admin-finanzas', role: 'admin', label: 'Admin finanzas' },
  { route: '/admin-mensajes', role: 'admin', label: 'Admin mensajes' },
  { route: '/admin-novedades', role: 'admin', label: 'Admin novedades' },
  { route: '/admin-parqueadero', role: 'admin', label: 'Admin parqueadero' },
  { route: '/admin-pqrs', role: 'admin', label: 'Admin PQRS' },
  { route: '/admin-residentes', role: 'admin', label: 'Admin residentes' },
  // superadmin
  { route: '/superadmin', role: 'superadmin', label: 'Superadmin' },
  // misc authed
  { route: '/asamblea', role: 'residente', label: 'Asamblea' },
];

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
