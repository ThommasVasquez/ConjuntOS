import { request } from '@playwright/test';
import { TESTER, ROUTES } from './roles';

/**
 * Warm the Next dev server before the suite runs.
 *
 * `next dev` compiles each route on its FIRST request (the heaviest, /seguridad,
 * takes ~17s / 535 modules). Without warming, the first test to hit a cold route
 * can blow its navigation/test budget — flaky, infra-only failures unrelated to
 * the app. We pay that cost once here so every test sees warm, fast routes.
 *
 * Skipped automatically against a production build / remote target (BASE_URL set
 * or PW_NO_WARM=1), where routes are already compiled.
 */
export default async function globalSetup() {
  if (process.env.PW_NO_WARM) return;
  const baseURL = process.env.PW_BASE_URL || 'http://localhost:3000';
  const ctx = await request.newContext({ baseURL });
  try {
    // Authenticate so routes render their real (compiled) content, not a redirect.
    await ctx.post('/api/v1/auth/login', { data: TESTER, timeout: 30_000 }).catch(() => {});
    const paths = ['/inicio', '/login', ...ROUTES.map((r) => r.route)];
    const unique = Array.from(new Set(paths));
    console.log(`[warm] compiling ${unique.length} routes...`);
    const started = Date.now();
    for (const p of unique) {
      await ctx.get(p, { timeout: 90_000 }).catch(() => {});
    }
    console.log(`[warm] done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  } finally {
    await ctx.dispose();
  }
}
