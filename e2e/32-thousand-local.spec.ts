import { test, expect } from '@playwright/test';
import { DEMO_ACCOUNTS } from './roles';

/**
 * 1000 concurrent users across roles — LOCAL stack, read-only coverage.
 *
 * Mirrors prod-1000users but points at the local backend and proves it green in
 * CI without touching production. Logs in a pool of the distinct-role demo
 * accounts once, then fires TOTAL concurrent GETs round-robined across the pool
 * so each account only hits endpoints its role can read. Asserts EVERY pooled
 * (role,endpoint) returned 2xx at least once AND ≥99% aggregate success (local =
 * no Cloudflare in front, so the bar is higher than prod's 95%).
 *
 * Run:  pnpm playwright test 32-thousand-local
 *       LOAD_USERS=50 pnpm playwright test 32-thousand-local   # smoke
 */
const BASE = process.env.API_BASE || 'http://localhost:8080/api/v1';
const TOTAL = Number(process.env.LOAD_USERS || 1000);

const COMMON = [
  'auth/me', 'usuarios/me/profile', 'usuarios/directorio', 'notificaciones',
  'comunicaciones', 'paquetes/mios', 'areas-comunes', 'reservas', 'encuestas',
  'pagos', 'multas', 'tramites', 'inmuebles', 'clasificados', 'anuncios', 'chat',
  'ad-spaces/active',
];
const RESIDENT = [...COMMON, 'sos/activa', 'pases-temporales/mis-pases'];
const STAFF_BASE = ['auth/me', 'usuarios/me/profile', 'notificaciones', 'usuarios/directorio'];

const ROLE_READS: Record<string, string[]> = {
  admin: [
    'admin/stats', 'admin/usuarios', 'admin/pagos', 'admin/finanzas/resumen',
    'admin/morosidad', 'admin/reservas', 'admin/solicitudes',
    'convivencia/casos', 'convivencia/unidades', ...COMMON,
  ],
  resident: RESIDENT,
  base: COMMON,
  vigilante: ['vigilancia/visitas', 'vigilancia/paquetes', 'vigilancia/stats', ...STAFF_BASE],
  parqueadero: ['parqueadero/stats', 'parqueadero/mapa', 'parqueadero/registros', ...STAFF_BASE],
  superadmin: ['superadmin/conjuntos', ...STAFF_BASE],
};

test.describe('1000 usuarios concurrentes (local, solo lectura)', () => {
  // admin@demo is the tester account whose real role other specs may have flipped
  // via switch-role. Ensure it is ADMINISTRADOR before exercising admin endpoints.
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE.replace('/api/v1', '') });
    try {
      const login = await ctx.request.post(`${BASE}/auth/login`, { data: DEMO_ACCOUNTS.ADMINISTRADOR });
      if (login.ok()) {
        // tester-only; harmless 403 if admin@demo is not whitelisted (then its role is already stable)
        await ctx.request.post(`${BASE}/auth/switch-role`, { data: { rol: 'ADMINISTRADOR' } }).catch(() => {});
      }
    } finally {
      await ctx.close();
    }
  });

  test(`${TOTAL} lecturas concurrentes — cobertura por rol`, async ({ browser }) => {
    test.setTimeout(300_000);

    const pool: { name: string; role: string; ctx: Awaited<ReturnType<typeof browser.newContext>> }[] = [];
    async function add(name: string, role: string, creds: { email: string; password: string }) {
      const ctx = await browser.newContext({ baseURL: BASE.replace('/api/v1', '') });
      const res = await ctx.request.post(`${BASE}/auth/login`, { data: creds, timeout: 30_000 });
      if (!res.ok()) { console.log(`   ⚠ login ${name} → ${res.status()}`); await ctx.close(); return; }
      pool.push({ name, role, ctx });
    }

    await add('admin', 'admin', DEMO_ACCOUNTS.ADMINISTRADOR);
    await add('residente', 'resident', DEMO_ACCOUNTS.PROPIETARIO);
    await add('arrendatario', 'base', DEMO_ACCOUNTS.ARRENDATARIO);
    await add('concejo', 'base', DEMO_ACCOUNTS.CONCEJO);
    await add('vigilante', 'vigilante', DEMO_ACCOUNTS.VIGILANTE);
    await add('supervisor', 'vigilante', DEMO_ACCOUNTS.SUPERVISOR_VIGILANCIA);
    await add('parqueadero', 'parqueadero', DEMO_ACCOUNTS.ENCARGADO_PARQUEADERO);
    await add('superadmin', 'superadmin', DEMO_ACCOUNTS.SUPER_ADMIN);

    expect(pool.length, 'demo pool must log in').toBeGreaterThanOrEqual(6);
    console.log(`   ✅ ${pool.length} cuentas en el pool`);

    const endpointsFor = (role: string) => ROLE_READS[role] || COMMON;
    const planned = new Set<string>();
    for (const { role } of pool) for (const ep of endpointsFor(role)) planned.add(`${role} ${ep}`);

    let ok = 0, fail = 0;
    const fails = new Map<string, number>();
    const coveredOk = new Set<string>();
    const latencies: number[] = [];
    const started = Date.now();

    const ops = Array.from({ length: TOTAL }, (_, i) => {
      const { name, role, ctx } = pool[i % pool.length];
      const eps = endpointsFor(role);
      const ep = eps[Math.floor(i / pool.length) % eps.length];
      const key = `${role} ${ep}`;
      return (async () => {
        const t0 = Date.now();
        try {
          const res = await ctx.request.get(`${BASE}/${ep}`, { timeout: 30_000 });
          latencies.push(Date.now() - t0);
          if (res.ok()) { ok++; coveredOk.add(key); }
          else { fail++; const k = `${name} → /${ep} (${res.status()})`; fails.set(k, (fails.get(k) || 0) + 1); }
        } catch (e: any) {
          fail++; const k = `${name} → /${ep} (${(e.message || 'err').slice(0, 30)})`;
          fails.set(k, (fails.get(k) || 0) + 1);
        }
      })();
    });
    await Promise.allSettled(ops);
    const elapsedMs = Date.now() - started;

    const total = ok + fail;
    const pct = total ? Math.round((ok / total) * 100) : 0;
    latencies.sort((a, b) => a - b);
    const p = (q: number) => latencies[Math.floor(latencies.length * q)] || 0;
    const uncovered = [...planned].filter((k) => !coveredOk.has(k));

    console.log(`\n📊 ${ok}/${total} OK (${pct}%) en ${(elapsedMs / 1000).toFixed(1)}s — ~${Math.round((total / elapsedMs) * 1000)} req/s`);
    console.log(`   Latencia p50 ${p(0.5)}ms · p95 ${p(0.95)}ms · p99 ${p(0.99)}ms`);
    console.log(`   Cobertura: ${coveredOk.size}/${planned.size} (rol,endpoint)`);
    if (uncovered.length) { console.log('\n⚠️ Sin cobertura 2xx:'); for (const k of uncovered) console.log(`   ${k}`); }
    if (fails.size) { console.log('\n❌ Fallas:'); for (const [r, c] of [...fails.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`   ${c}x ${r}`); }

    await Promise.all(pool.map((pp) => pp.ctx.close()));
    expect(pct, '≥99% de lecturas 2xx (local)').toBeGreaterThanOrEqual(99);
    expect(uncovered, 'cada (rol,endpoint) cubierto con ≥1 lectura 2xx').toEqual([]);
  });
});
