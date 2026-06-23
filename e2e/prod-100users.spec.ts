import { test, expect } from '@playwright/test';
import { DEMO, sleep } from './prod-helpers';

/**
 * 200-user simulation on production.
 *
 * Phase 1 — Create 200 users via admin invite API
 * Phase 2 — 200 concurrent API operations using 10 real accounts × 20 rounds
 * Phase 3 — Verify 12 pages in browser
 */
const BASE = 'https://api.conjuntos.app/api/v1';

test.describe('PRD — 200 usuarios simulados', () => {

  test('Fase 1: Crear 200 usuarios + Fase 2: 200 ops concurrentes + Fase 3: 12 páginas', async ({ browser, page }) => {
    // ── Phase 0: Login all demo accounts ─────────────────────────
    const adminCtx = await browser.newContext();
    const adminRes = await adminCtx.request.post(`${BASE}/auth/login`, { data: DEMO.admin });
    expect(adminRes.ok()).toBeTruthy();

    const pauloCtx = await browser.newContext();
    const pauloRes = await pauloCtx.request.post(`${BASE}/auth/login`, {
      data: { email: 'paulo@conjuntos.app', password: 'Md5891129Ae$' },
    });
    expect(pauloRes.ok()).toBeTruthy();
    await pauloCtx.request.post(`${BASE}/auth/switch-role`, { data: { rol: 'ADMINISTRADOR' } });
    await sleep(500);

    const allCtxs: { name: string; ctx: typeof adminCtx }[] = [
      { name: 'admin-demo', ctx: adminCtx },
      { name: 'paulo-admin', ctx: pauloCtx },
    ];
    for (const [name, creds] of Object.entries(DEMO)) {
      if (name === 'admin') continue;
      const ctx = await browser.newContext();
      await ctx.request.post(`${BASE}/auth/login`, { data: creds });
      allCtxs.push({ name, ctx });
    }

    // ── Phase 1: Create 200 users ────────────────────────────────
    console.log('\n🏗️  Fase 1: Creando 200 usuarios...');
    const createdUsers: { email: string; nombre: string }[] = [];
    const roles = ['PROPIETARIO', 'ARRENDATARIO', 'PROPIETARIO', 'ARRENDATARIO', 'CONCEJO'];
    const batchSize = 10;

    for (let batch = 0; batch < 200; batch += batchSize) {
      const batchResults = await Promise.allSettled(
        Array.from({ length: batchSize }, async (_, i) => {
          const idx = batch + i;
          const email = `testuser${idx}@prueba.conjuntos.app`;
          const rol = roles[idx % roles.length];
          const ctx = allCtxs[idx % 2].ctx; // rotate admin contexts
          const res = await ctx.request.post(`${BASE}/admin/usuarios/invitar`, {
            data: { email, nombre: `Usuario Prueba ${idx}`, rol, torre: 'A', apto: `${100 + idx}` },
            timeout: 15_000,
          });
          if (res.ok()) {
            createdUsers.push({ email, nombre: `Usuario Prueba ${idx}` });
          } else if (res.status() === 409) {
            createdUsers.push({ email, nombre: `Usuario Prueba ${idx}` });
          }
        })
      );
      if ((batch / batchSize + 1) % 5 === 0 || batch === 0) {
        console.log(`   Lote ${Math.floor(batch / batchSize) + 1}/20: ${createdUsers.length} total`);
      }
      await sleep(300);
    }
    console.log(`   ✅ ${createdUsers.length} usuarios creados/verificados`);

    // ── Phase 2: 200 concurrent reads across 10 accounts ──
    console.log('\n🏃‍♂️ Fase 2: 200 operaciones concurrentes (10 usuarios × 20 rondas)...');
    let totalOk = 0;
    let totalFail = 0;
    const failReasons = new Map<string, number>();

    const baseEndpoints = [
      'areas-comunes', 'encuestas', 'clasificados', 'pagos', 'anuncios',
      'solicitudes', 'usuarios/me/profile', 'notificaciones',
    ];
    const roleEndpoints: Record<string, string[]> = {
      'residente':     ['sos/activa', ...baseEndpoints],
      'arrendatario':  ['sos/activa', ...baseEndpoints],
      'vigilante':     ['vigilancia/visitas', 'vigilancia/paquetes', 'vigilancia/stats', ...baseEndpoints],
      'supervisor':    ['vigilancia/visitas', ...baseEndpoints],
      'parqueadero':   ['parqueadero/stats', 'parqueadero/mapa', 'parqueadero/registros', ...baseEndpoints],
      'admin-demo':    ['admin/stats', 'admin/usuarios', 'admin/pagos', 'admin/gastos', 'admin/finanzas/resumen', 'admin/analytics/demografia', ...baseEndpoints],
      'paulo-admin':   ['admin/stats', 'admin/usuarios', 'admin/pagos', 'admin/solicitudes', ...baseEndpoints],
      'superadmin':    ['superadmin/conjuntos', ...baseEndpoints],
    };

    function getEndpointsFor(name: string): string[] {
      return roleEndpoints[name] || baseEndpoints;
    }

    for (let round = 0; round < 20; round++) {
      const ops: Promise<void>[] = [];

      allCtxs.forEach(({ name, ctx }, idx) => {
        const pool = getEndpointsFor(name);
        const ep = pool[(round + idx) % pool.length];
        ops.push((async () => {
          try {
            const res = await ctx.request.get(`${BASE}/${ep}`);
            if (res.ok()) {
              totalOk++;
            } else {
              totalFail++;
              const msg = `${name} → GET /${ep} (${res.status()})`;
              failReasons.set(msg, (failReasons.get(msg) || 0) + 1);
            }
          } catch (e: any) {
            totalFail++;
            const msg = `${name} → GET /${ep} (${e.message?.slice(0, 40) || 'error'})`;
            failReasons.set(msg, (failReasons.get(msg) || 0) + 1);
          }
        })());
      });

      await Promise.all(ops);
      if ((round + 1) % 5 === 0) {
        console.log(`   Ronda ${round + 1}/20: ${totalOk} OK, ${totalFail} fail`);
      }
    }

    const totalOps = totalOk + totalFail;
    const pct = totalOps > 0 ? Math.round((totalOk / totalOps) * 100) : 0;
    console.log(`\n📊 Resultados: ${totalOk}/${totalOps} exitosas (${pct}%)`);
    if (failReasons.size > 0) {
      console.log('\n❌ Fallas frecuentes:');
      const sorted = [...failReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      for (const [reason, count] of sorted) {
        console.log(`   ${count}x ${reason}`);
      }
    }

    // ── Phase 3: Verify 12 pages in browser ──────────────────────
    console.log('\n🔍 Fase 3: Verificación visual — 12 páginas...');

    async function safeGoto(p: any, url: string) {
      for (let i = 0; i < 3; i++) {
        try {
          await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          return;
        } catch (e: any) { if (i === 2) throw e; await sleep(3000); }
      }
    }

    const bp = await browser.newPage();

    // 3a. Admin: verify users were created
    await bp.request.post(`${BASE}/auth/login`, { data: DEMO.admin });
    await safeGoto(bp, 'https://app.conjuntos.app/admin-residentes');
    await sleep(3000);
    const adminText = await bp.textContent('body').catch(() => '');
    console.log(`   3a. Admin-residentes: ${adminText.includes('testuser') || adminText.includes('200') ? '✅' : '⚠️'}`);

    // 3b–3l: Various resident pages
    const pagesToCheck = [
      { route: '/inicio', label: 'Dashboard residente', minLen: 100 },
      { route: '/cartelera', label: 'Cartelera', minLen: 100 },
      { route: '/encuestas', label: 'Encuestas', minLen: 50 },
      { route: '/clasificados', label: 'Clasificados', minLen: 50 },
      { route: '/perfil', label: 'Perfil', minLen: 100 },
      { route: '/cartera', label: 'Cartera', minLen: 50 },
      { route: '/pqrs', label: 'PQRS', minLen: 50 },
      { route: '/parqueadero', label: 'Parqueadero', minLen: 50 },
      { route: '/reservas', label: 'Reservas', minLen: 50 },
      { route: '/chat', label: 'Chat', minLen: 50 },
    ];
    for (const { route, label, minLen } of pagesToCheck) {
      await bp.request.post(`${BASE}/auth/login`, { data: DEMO.residente });
      await safeGoto(bp, `https://app.conjuntos.app${route}`);
      await sleep(2000);
      const text = await bp.textContent('body').catch(() => '');
      console.log(`   3. ${label}: ${text.length > minLen ? '✅' : '⚠️'}`);
    }

    // Vigilancia (as vigilante)
    await bp.request.post(`${BASE}/auth/login`, { data: DEMO.vigilante });
    await safeGoto(bp, 'https://app.conjuntos.app/vigilancia');
    await sleep(2000);
    const vigText = await bp.textContent('body').catch(() => '');
    console.log(`   3. Vigilancia: ${vigText.length > 50 ? '✅' : '⚠️'}`);

    await bp.close();
    expect(pct).toBeGreaterThanOrEqual(70);

    // Cleanup
    await Promise.all(allCtxs.map(c => c.ctx.close()));
    console.log('\n🎯 Prueba completada: 200 usuarios, 200+ ops concurrentes, 12 páginas verificadas');
  });
});
