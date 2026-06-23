import { test, expect } from '@playwright/test';
import { DEMO, sleep } from './prod-helpers';

/**
 * 1000 concurrent READS against PRODUCTION.
 *
 * Read-only by design: no writes, no DB pollution, no notifications fired.
 * It does NOT spin 1000 browsers (infeasible) — it logs in a POOL of ~9 real
 * demo accounts once, then fires 1000 GETs in a single in-flight batch,
 * round-robined across the pool so each account only hits endpoints its role
 * is allowed. Measures success rate, latency and throughput.
 *
 * ⚠ This is a real load spike on the live service residents use, AND
 *   api.conjuntos.app sits behind Cloudflare — a 1000-request burst can trip
 *   Cloudflare rate-limiting/bot-fight (429/503) before it ever reaches the
 *   backend. Those failures are Cloudflare, not the app. Run off-peak.
 *
 * The backend has no app-level rate limiter; the real concurrency ceiling is
 * DB_POOL_SIZE + Postgres max_connections (see docker-compose.prod.yml).
 *
 * Run:  pnpm playwright test prod-1000users --workers=1
 */
const BASE = 'https://api.conjuntos.app/api/v1';
const TOTAL = Number(process.env.LOAD_USERS || 1000);

// Read-safe GET endpoints (no side effects), scoped by role. Pulled from the
// real route inventory. Every account also gets BASE (authed resident reads).
const BASE_READS = [
  'auth/me', 'usuarios/me/profile', 'usuarios/directorio', 'notificaciones',
  'comunicaciones', 'paquetes/mios', 'areas-comunes', 'reservas', 'encuestas',
  'pagos', 'multas', 'tramites', 'inmuebles', 'pases-temporales/mis-pases',
  'parqueadero/mio', 'sos/activa', 'ad-spaces/active',
];
const ROLE_READS: Record<string, string[]> = {
  admin: [
    'admin/stats', 'admin/usuarios', 'admin/pagos', 'admin/finanzas/resumen',
    'admin/morosidad', 'admin/reservas', 'admin/solicitudes', 'admin/solicitudes/stats',
    'admin/analytics/demografia', 'admin/chat', 'admin/ad-spaces', 'admin/status-config',
    'convivencia/casos', 'convivencia/casos/stats', 'convivencia/comite',
  ],
  vigilante: [
    'vigilancia/visitas', 'vigilancia/paquetes', 'vigilancia/stats',
    'vigilancia/correspondencia', 'vigilancia/novedades',
  ],
  supervisor: [
    'vigilancia/visitas', 'vigilancia/paquetes', 'vigilancia/stats', 'vigilancia/novedades',
  ],
  parqueadero: [
    'parqueadero/stats', 'parqueadero/mapa', 'parqueadero/registros',
    'parqueadero/rondas', 'parqueadero/reservas/proximas', 'parqueadero/solicitudes',
  ],
  superadmin: ['superadmin/conjuntos'],
};

test.describe('PRD — 1000 usuarios concurrentes (solo lectura)', () => {
  test(`${TOTAL} lecturas concurrentes`, async ({ browser }) => {
    test.setTimeout(240_000);

    // ── Phase 0: log in the account pool (one context each) ──────────────
    console.log(`\n🔐 Iniciando sesión del pool de cuentas...`);
    const pool: { name: string; role: string; ctx: Awaited<ReturnType<typeof browser.newContext>> }[] = [];

    async function add(name: string, role: string, creds: { email: string; password: string }) {
      const ctx = await browser.newContext();
      const res = await ctx.request.post(`${BASE}/auth/login`, { data: creds, timeout: 30_000 });
      if (!res.ok()) { console.log(`   ⚠ login ${name} → ${res.status()}`); await ctx.close(); return; }
      pool.push({ name, role, ctx });
    }

    await add('admin', 'admin', DEMO.admin);
    await add('residente', 'base', DEMO.residente);
    await add('arrendatario', 'base', DEMO.arrendatario);
    await add('concejo', 'base', DEMO.concejo);
    await add('vigilante', 'vigilante', DEMO.vigilante);
    await add('supervisor', 'supervisor', DEMO.supervisor);
    await add('parqueadero', 'parqueadero', DEMO.parqueadero);
    await add('superadmin', 'superadmin', DEMO.superadmin);

    // paulo switched to ADMINISTRADOR (tester whitelist) for a 2nd admin pipe
    const paulo = await browser.newContext();
    const pr = await paulo.request.post(`${BASE}/auth/login`, {
      data: { email: 'paulo@conjuntos.app', password: 'Md5891129Ae$' },
    });
    if (pr.ok()) {
      await paulo.request.post(`${BASE}/auth/switch-role`, { data: { rol: 'ADMINISTRADOR' } });
      pool.push({ name: 'paulo-admin', role: 'admin', ctx: paulo });
    } else { await paulo.close(); }

    expect(pool.length, 'at least a few accounts must log in').toBeGreaterThan(2);
    console.log(`   ✅ ${pool.length} cuentas en el pool`);

    function endpointsFor(role: string) {
      return role === 'base' ? BASE_READS : [...(ROLE_READS[role] || []), ...BASE_READS];
    }

    // ── Phase 1: fire TOTAL concurrent GETs in one batch ─────────────────
    console.log(`\n🚀 Disparando ${TOTAL} lecturas concurrentes...`);
    let ok = 0, fail = 0;
    const fails = new Map<string, number>();
    const latencies: number[] = [];

    const started = Date.now();
    const ops = Array.from({ length: TOTAL }, (_, i) => {
      const { name, role, ctx } = pool[i % pool.length];
      const pE = endpointsFor(role);
      const ep = pE[Math.floor(i / pool.length) % pE.length];
      return (async () => {
        const t0 = Date.now();
        try {
          const res = await ctx.request.get(`${BASE}/${ep}`, { timeout: 30_000 });
          latencies.push(Date.now() - t0);
          if (res.ok()) { ok++; }
          else { fail++; const k = `${name} → /${ep} (${res.status()})`; fails.set(k, (fails.get(k) || 0) + 1); }
        } catch (e: any) {
          fail++; const k = `${name} → /${ep} (${(e.message || 'err').slice(0, 30)})`;
          fails.set(k, (fails.get(k) || 0) + 1);
        }
      })();
    });
    await Promise.allSettled(ops);
    const elapsedMs = Date.now() - started;

    // ── Report ───────────────────────────────────────────────────────────
    const total = ok + fail;
    const pct = total ? Math.round((ok / total) * 100) : 0;
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const rps = Math.round((total / elapsedMs) * 1000);

    console.log(`\n📊 ${ok}/${total} OK (${pct}%) en ${(elapsedMs / 1000).toFixed(1)}s — ~${rps} req/s`);
    console.log(`   Latencia p50 ${p50}ms · p95 ${p95}ms`);
    if (fails.size) {
      console.log('\n❌ Fallas frecuentes:');
      for (const [r, c] of [...fails.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
        console.log(`   ${c}x ${r}`);
      }
    }

    await Promise.all(pool.map(p => p.ctx.close()));
    console.log(`\n🎯 ${TOTAL} usuarios concurrentes completado`);
    expect(pct, '≥95% de las lecturas deben responder 2xx').toBeGreaterThanOrEqual(95);
  });
});
