import { Page, expect } from '@playwright/test';
import { TESTER, type Rol } from './roles';

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Log in the tester account via the API (sets the Lax session cookie). */
export async function loginTester(page: Page) {
  const res = await page.request.post('/api/v1/auth/login', { data: TESTER, timeout: 30_000 });
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`);
}

/** Switch the tester's real role server-side, then reload so the UI re-fetches. */
export async function switchTo(page: Page, rol: Rol) {
  const res = await page.request.post('/api/v1/auth/switch-role', { data: { rol }, timeout: 30_000 });
  if (!res.ok()) throw new Error(`switch-role ${rol} failed: ${res.status()}`);
}

const CRASH = /Application error|Unhandled Runtime Error|client-side exception|Something went wrong|TypeError:|undefined is not/i;

/** Attach a console + pageerror collector. Returns a getter for collected errors. */
export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      // Ignore noisy-but-benign network/asset errors that aren't app crashes.
      // - asset/status noise (favicon, 401/403/404 on optional resources)
      // - Next.js dev-mode RSC prefetch fallback: navigation still succeeds (Next
      //   logs this then does a full browser navigation; assertRendered covers it).
      if (/Failed to load resource|favicon|net::ERR|status of 401|status of 403|status of 404|manifest/i.test(t)) return;
      if (/Failed to fetch RSC payload|Falling back to browser navigation/i.test(t)) return;
      errors.push(`console.error: ${t}`);
    }
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return () => errors;
}

/** Assert the page rendered as a real app screen, not a bounce or a crash. */
export async function assertRendered(page: Page, where: string) {
  await expect(page, `${where}: should not bounce to /login`).not.toHaveURL(/\/login/);
  const body = (await page.textContent('body').catch(() => '')) || '';
  expect(body.length, `${where}: should render content`).toBeGreaterThan(40);
  expect(body, `${where}: no crashed error boundary`).not.toMatch(CRASH);
  await expect(page.locator('body'), `${where}: body visible`).toBeVisible();
}

const DESTRUCTIVE = /eliminar|borrar|delete|cerrar sesi|salir|logout|anular|revocar|rechazar|remove|desactivar|expulsar|bloquear/i;
const OPENERS = /nuevo|crear|agregar|añadir|registrar|reportar|solicitar|reservar|invitar|abrir|publicar|generar|^\+$/i;
const SUBMITTERS = /guardar|enviar|crear|confirmar|publicar|reservar|registrar|aceptar/i;

async function fillVisibleInputs(page: Page) {
  const inputs = page.locator(
    'input:visible:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([disabled]):not([readonly]), textarea:visible:not([disabled]):not([readonly])'
  );
  const n = Math.min(await inputs.count().catch(() => 0), 8);
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
      'Prueba E2E';
    await el.fill(val, { timeout: 1000 }).catch(() => {});
  }
  // pick the first option of any visible select. selectOption defaults to a 30s
  // timeout — an unselectable dropdown (e.g. a single-option resident filter) would
  // otherwise stall 30s × every call and blow the test budget. Cap it hard.
  const selects = page.locator('select:visible:not([disabled])');
  const sn = Math.min(await selects.count().catch(() => 0), 3);
  for (let i = 0; i < sn; i++) {
    await selects.nth(i).selectOption({ index: 1 }, { timeout: 1500 }).catch(() => {});
  }
}

/**
 * Behave like a user: fill inline inputs, then open up to 3 create-forms,
 * fill them, and either submit (SUBMIT=1) or cancel. Never clicks destructive
 * actions. Returns the number of forms opened.
 */
/** exerciseForms wrapped so no single view can exceed `capMs` of interaction. */
export async function exerciseFormsCapped(page: Page, capMs = 25_000): Promise<number> {
  return Promise.race([
    exerciseForms(page),
    page.waitForTimeout(capMs).then(() => 0),
  ]);
}

export async function exerciseForms(page: Page, submit = !!process.env.SUBMIT): Promise<number> {
  // Best-effort settle; capped low so a chatty page (polling/WS) doesn't burn the
  // per-test budget across ~20 views.
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(400);
  await fillVisibleInputs(page);

  const openers = page.getByRole('button', { name: OPENERS });
  const count = Math.min(await openers.count().catch(() => 0), 3);
  let opened = 0;
  for (let i = 0; i < count; i++) {
    const btn = openers.nth(i);
    const name = (await btn.textContent().catch(() => '')) || '';
    if (DESTRUCTIVE.test(name)) continue;
    if (!(await btn.isVisible().catch(() => false))) continue;
    await btn.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(600);
    await fillVisibleInputs(page);
    opened++;

    if (submit) {
      const s = page.getByRole('button', { name: SUBMITTERS }).first();
      if (await s.isVisible().catch(() => false)) {
        await s.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(900);
      }
    }
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  }
  return opened;
}

/** Click each bottom-nav tab and assert it navigates without a crash. */
export async function clickNavTabs(page: Page, tabs: { name: string; path: string }[]) {
  for (const tab of tabs) {
    const link = page.locator(`a[href="${tab.path}"]`).first();
    if (!(await link.isVisible().catch(() => false))) continue;
    await link.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    await assertRendered(page, `nav→${tab.name}`);
  }
}
