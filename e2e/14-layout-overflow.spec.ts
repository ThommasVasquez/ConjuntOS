import { test, expect, Page } from '@playwright/test';
import { loginAsAdmin, loginAsResident, loginAsVigilante } from './helpers';

/**
 * Layout / frame-overflow audit across all views.
 *
 * The app renders inside `.app-shell` (max-width:430px, centered). `.app-shell` has no
 * transform, so `position: fixed` resolves to the VIEWPORT — on a viewport wider than 430px
 * a fixed bar sized to the viewport spills OUTSIDE the frame (the `/asistente` input bug).
 *
 * Run at a desktop viewport (frame is a centered column) so that class of bug is exposed,
 * then assert no element extends past the frame horizontally. Full-screen modal overlays
 * (fixed inset-0 dim backdrops) are intentionally viewport-wide and skipped.
 *
 * Needs the stack up:  pnpm dev  +  Rust backend on :8080 (seeded demo accounts).
 * Run:  pnpm dlx playwright test e2e/14-layout-overflow.spec.ts
 */

const RESIDENT_ROUTES = [
  '/inicio', '/asistente', '/encuestas', '/pagos', '/perfil', '/clasificados',
  '/inmobiliaria', '/reservas', '/pqrs', '/cartelera', '/citofonia', '/chat',
  '/directorio', '/novedades', '/pases-temporales', '/visitantes',
];
const ADMIN_ROUTES = [
  '/inicio', '/admin-analytics', '/admin-areas', '/admin-banners', '/admin-finanzas',
  '/admin-mensajes', '/admin-novedades', '/admin-parqueadero', '/admin-pqrs',
  '/admin-residentes', '/comite-convivencia',
];
const VIGILANTE_ROUTES = [
  '/vigilancia', '/control-visitas', '/novedades-seguridad', '/paqueteria',
  '/correspondencia', '/seguridad',
];

type Offender = { tag: string; cls: string; left: number; right: number };

// Find elements whose horizontal box escapes the `.app-shell` frame.
// Skips full-screen overlays (fixed elements that intentionally cover the viewport).
async function frameOverflow(page: Page): Promise<Offender[]> {
  return page.evaluate(() => {
    const shell = document.querySelector('.app-shell') as HTMLElement | null;
    if (!shell) return [];
    const f = shell.getBoundingClientRect();
    const tol = 2;
    const bad: Offender[] = [];
    // An element only VISIBLY overflows the frame if nothing clips it. Per CSS,
    // `overflow: hidden`/`clip`/`auto`/`scroll` on an ancestor clips normal-flow
    // and `absolute` descendants, but a `position: fixed` element escapes that
    // clip (it resolves against the viewport). `.app-shell` and the decorative
    // `fixed inset-0 overflow-hidden` background layer both clip their children,
    // so the blurred blobs and the giant watermark text (intentionally placed
    // off-frame) are clipped and cannot spill. A viewport-wide fixed bar (the
    // /asistente input bug this audit targets) is NOT clipped and is reported.
    const isClipped = (el: HTMLElement): boolean => {
      if (getComputedStyle(el).position === 'fixed') return false; // escapes ancestor overflow
      let node: HTMLElement | null = el.parentElement;
      while (node && node !== document.documentElement) {
        const cs = getComputedStyle(node);
        if (cs.overflowX !== 'visible') return true; // clipped by this ancestor
        if (cs.position === 'fixed') return false; // containing block escapes higher clips
        node = node.parentElement;
      }
      return false;
    };
    document.querySelectorAll<HTMLElement>('.app-shell *').forEach((el) => {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      // Clipped by an ancestor's overflow → cannot visibly overflow the frame.
      if (isClipped(el)) return;
      // intentional full-screen overlay/backdrop — not a frame element
      const fullscreenOverlay =
        s.position === 'fixed' && r.left <= tol && r.right >= window.innerWidth - tol;
      if (fullscreenOverlay) return;
      if (r.right > f.right + tol || r.left < f.left - tol) {
        bad.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className?.toString?.() || '').slice(0, 90),
          left: Math.round(r.left),
          right: Math.round(r.right),
        });
      }
    });
    return bad;
  });
}

function sweep(name: string, login: (p: Page) => Promise<void>, routes: string[]) {
  test.describe(`${name} — frame overflow`, () => {
    test.use({ viewport: { width: 1280, height: 900 } }); // wide → frame is centered → exposes fixed-escape bugs
    for (const route of routes) {
      test(`${route}`, async ({ page }) => {
        await login(page);
        const resp = await page.goto(route, { waitUntil: 'networkidle' });
        // skip routes this role can't reach (redirect/403) rather than fail on auth
        if (resp && resp.status() >= 400) test.skip(true, `unreachable for ${name}: ${resp.status()}`);
        await page.waitForTimeout(400); // let animations settle
        await page.screenshot({
          path: `test-results/layout/${name}${route.replace(/\//g, '_')}.png`,
          fullPage: true,
        });
        const bad = await frameOverflow(page);
        expect(bad, `${route}: ${JSON.stringify(bad, null, 2)}`).toEqual([]);
      });
    }
  });
}

sweep('resident', loginAsResident, RESIDENT_ROUTES);
sweep('admin', loginAsAdmin, ADMIN_ROUTES);
sweep('vigilante', loginAsVigilante, VIGILANTE_ROUTES);
