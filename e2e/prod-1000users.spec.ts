import { test, expect } from '@playwright/test';
import { DEMO, sleep } from './prod-helpers';

/**
 * 1000 concurrent READS against PRODUCTION — full read-coverage of every role.
 *
 * Read-only by design: no writes, no DB pollution, no notifications fired.
 * It does NOT spin 1000 browsers (infeasible) — it logs in a POOL of ~9 real
 * demo accounts once, then fires 1000 GETs in a single in-flight batch,
 * round-robined across the pool so each account only hits endpoints its role
 * is allowed. Every pooled endpoint is exercised many times.
 *
 * Coverage: asserts EVERY pooled endpoint returned 2xx at least once (so "all
 * features covered" is proven, not assumed) AND ≥95% aggregate success.
 *
 * ⚠ Real load spike on the live service, AND api.conjuntos.app sits behind
 *   Cloudflare — a 1000-request burst can trip CF rate-limiting (429/503)
 *   before it reaches the backend. Those are Cloudflare, not the app. Off-peak.
 *
 * Run:  pnpm playwright test prod-1000users --workers=1
 *       LOAD_USERS=30 pnpm playwright test prod-1000users   # smoke
 */
const BASE = 'https://api.conjuntos.app/api/v1';
const TOTAL = Number(process.env.LOAD_USERS || 1000);

// Parameterless read-safe GET endpoints, scoped by role (role gates verified
// empirically against prod — see the smoke run that pruned 403/404 endpoints).
// COMMON = anything any authenticated user can read without a 403/404:
const COMMON = [
  'auth/me', 'usuarios/me/profile', 'usuarios/directorio', 'notificaciones',
  'comunicaciones', 'paquetes/mios', 'areas-comunes', 'reservas', 'encuestas',
  'pagos', 'multas', 'tramites', 'inmuebles', 'clasificados', 'anuncios', 'chat',
  'ad-spaces/active', 'parqueadero/mio', 'parqueadero/cargos/mios',
  'parqueadero/reservas/mias', 'parqueadero/sesiones/mias', 'parqueadero/solicitudes/mias',
];
// Resident-only (PROPIETARIO): the SOS panic state + own temporary passes.
const RESIDENT = [...COMMON, 'sos/activa', 'pases-temporales/mis-pases'];
const STAFF_BASE = ['auth/me', 'usuarios/me/profile', 'notificaciones', 'usuarios/directorio'];

const ROLE_READS: Record<string, string[]> = {
  resident: RESIDENT,
  base: COMMON, // arrendatario / concejo: common reads only (no sos/pases gate)
  admin: [
    'admin/stats', 'admin/usuarios', 'admin/pagos', 'admin/finanzas/resumen',
    'admin/morosidad', 'admin/reservas', 'admin/solicitudes', 'admin/solicitudes/stats',
    'admin/analytics/demografia', 'admin/chat', 'admin/ad-spaces', 'admin/status-config',
    'convivencia/casos', 'convivencia/casos/stats', 'convivencia/comite/historico',
    'convivencia/unidades', ...COMMON,
  ],
  vigilante: [
    'vigilancia/visitas', 'vigilancia/paquetes', 'vigilancia/stats',
    'vigilancia/correspondencia', 'vigilancia/novedades', ...STAFF_BASE,
  ],
  supervisor: [
    'vigilancia/visitas', 'vigilancia/paquetes', 'vigilancia/stats',
    'vigilancia/correspondencia', 'vigilancia/novedades', ...STAFF_BASE,
  ],
  parqueadero: [
    'parqueadero/stats', 'parqueadero/mapa', 'parqueadero/registros',
    'parqueadero/rondas', 'parqueadero/puntos-ronda', 'parqueadero/reservas/proximas',
    ...STAFF_BASE,
  ],
  superadmin: ['superadmin/conjuntos', ...STAFF_BASE],
};

test.describe('PRD — 1000 usuarios concurrentes (solo lectura, cobertura total)', () => {
  test(`${TOTAL} lecturas concurrentes`, async ({ browser }) => {
    test.setTimeout(300_000);

    // ── Phase 0: log in the account pool ─────────────────────────────────
    console.log(`\n🔐 Iniciando sesión del pool de cuentas...`);
    const pool: { name: string; role: string; ctx: Awaited<ReturnType<typeof browser.newContext>> }[] = [];

    async function add(name: string, role: string, creds: { email: string; password: string }) {
      const ctx = await browser.newContext();
      const res = await ctx.request.post(`${BASE}/auth/login`, { data: creds, timeout: 30_000 });
      if (!res.ok()) { console.log(`   ⚠ login ${name} → ${res.status()}`); await ctx.close(); return; }
      pool.push({ name, role, ctx });
    }

    await add('admin', 'admin', DEMO.admin);
    await add('residente', 'resident', DEMO.residente);
    await add('arrendatario', 'base', DEMO.arrendatario);
    await add('concejo', 'base', DEMO.concejo);
    await add('vigilante', 'vigilante', DEMO.vigilante);
    await add('supervisor', 'supervisor', DEMO.supervisor);
    await add('parqueadero', 'parqueadero', DEMO.parqueadero);
    await add('superadmin', 'superadmin', DEMO.superadmin);

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

    function endpointsFor(role: string) { return ROLE_READS[role] || COMMON; }

    // distinct (role,endpoint) pairs we intend to cover
    const planned = new Set<string>();
    for (const { role } of pool) for (const ep of endpointsFor(role)) planned.add(`${role} ${ep}`);

    // ── Phase 1: fire TOTAL concurrent GETs in one batch ─────────────────
    console.log(`\n🚀 Disparando ${TOTAL} lecturas concurrentes sobre ${planned.size} (rol,endpoint)...`);
    let ok = 0, fail = 0;
    const fails = new Map<string, number>();
    const coveredOk = new Set<string>();
    const latencies: number[] = [];

    const started = Date.now();
    const ops = Array.from({ length: TOTAL }, (_, i) => {
      const { name, role, ctx } = pool[i % pool.length];
      const pE = endpointsFor(role);
      const ep = pE[Math.floor(i / pool.length) % pE.length];
      const key = `${role} ${ep}`;
      return (async () => {
        const t0 = Date.now();
        try {
          const res = await ctx.request.get(`${BASE}/${ep}`, { timeout: 30_000 });
          latencies.push(Date.now() - t0);
          if (res.ok()) { ok++; coveredOk.add(key); }
          else { fail++; fails.set(`${name} → /${ep} (${res.status()})`, (fails.get(`${name} → /${ep} (${res.status()})`) || 0) + 1); }
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
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
    const rps = Math.round((total / elapsedMs) * 1000);
    const uncovered = [...planned].filter(k => !coveredOk.has(k));

    console.log(`\n📊 ${ok}/${total} OK (${pct}%) en ${(elapsedMs / 1000).toFixed(1)}s — ~${rps} req/s`);
    console.log(`   Latencia p50 ${p50}ms · p95 ${p95}ms · p99 ${p99}ms`);
    console.log(`   Cobertura: ${coveredOk.size}/${planned.size} (rol,endpoint) con ≥1 lectura 2xx`);
    if (uncovered.length) {
      console.log('\n⚠️ Endpoints SIN cobertura 2xx:');
      for (const k of uncovered) console.log(`   ${k}`);
    }
    if (fails.size) {
      console.log('\n❌ Fallas frecuentes:');
      for (const [r, c] of [...fails.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`   ${c}x ${r}`);
    }

    await Promise.all(pool.map(p => p.ctx.close()));
    console.log(`\n🎯 ${TOTAL} usuarios concurrentes completado`);
    expect(pct, '≥95% de las lecturas deben responder 2xx').toBeGreaterThanOrEqual(95);
    expect(uncovered, 'cada (rol,endpoint) debe tener ≥1 lectura 2xx').toEqual([]);
  });
});
