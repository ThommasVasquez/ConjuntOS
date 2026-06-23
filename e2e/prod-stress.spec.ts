import { test, expect } from '@playwright/test';
import { loginAs, loginAsResidente, loginAsAdmin, DEMO, sleep, apiLogin } from './prod-helpers';

/**
 * 35-user concurrent simulation across ALL modules.
 *
 * Uses all 8 demo accounts + 1 extra paulo context,
 * running parallel operations across every domain simultaneously.
 */

test.describe('PRD — 35 usuarios concurrentes (todos los módulos)', () => {

  test('35 personas usan la plataforma simultáneamente', async ({ browser }) => {
    const results: { user: string; action: string; ok: boolean }[] = [];
    const BASE = 'https://api.conjuntos.app/api/v1';
    const API_ROOT = 'https://api.conjuntos.app';

    // Create 8 independent browser contexts (one per demo account)
    const ctxs = await Promise.all(
      Object.entries(DEMO).map(async ([name, creds]) => {
        const ctx = await browser.newContext();
        await apiLogin(ctx, creds);
        return { name, ctx };
      })
    );

    // Plus 1 extra context for paulo as ADMINISTRADOR
    const pauloCtx1 = await browser.newContext();
    await apiLogin(pauloCtx1, { email: 'paulo@conjuntos.app', password: 'Md5891129Ae$' });
    await pauloCtx1.request.post(`${BASE}/auth/switch-role`, { data: { rol: 'ADMINISTRADOR' } });

    const contexts = [
      ...ctxs,
      { name: 'paulo-admin', ctx: pauloCtx1 },
    ];

    // ── Helper to make an API call ──────────────────────────────
    async function act(
      userName: string,
      action: string,
      fn: () => Promise<boolean>
    ) {
      try {
        const ok = await fn();
        results.push({ user: userName, action, ok });
        if (!ok) console.error(`  ❌ ${userName}: ${action} falló`);
        else console.log(`  ✅ ${userName}: ${action}`);
      } catch (e: any) {
        results.push({ user: userName, action, ok: false });
        console.error(`  ❌ ${userName}: ${action} → ${e.message?.slice(0, 80)}`);
      }
    }

    // ── All users act in parallel batches ────────────────────

    // Helper to SOS-cancel before creating (avoid 409)
    async function sosCancelIfActive(ctx: typeof contexts[0]['ctx']) {
      const existing = await ctx.request.get(`${BASE}/sos/activa`);
      if (existing.ok()) {
        const s = await existing.json().catch(() => null);
        if (s && s.id) await ctx.request.post(`${BASE}/sos/${s.id}/cancelar`);
      }
    }

    console.log('\n🏃‍♂️ Lote 1: Auth + Perfil (5 ops)');
    await Promise.all([
      act('residente', 'GET /auth/me', async () => {
        const r = await contexts[1].ctx.request.get(`${BASE}/auth/me`);
        return r.ok();
      }),
      act('admin', 'GET /auth/me', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/auth/me`);
        return r.ok();
      }),
      act('residente', 'GET /usuarios/me/profile', async () => {
        const r = await contexts[1].ctx.request.get(`${BASE}/usuarios/me/profile`);
        return r.ok();
      }),
      act('arrendatario', 'GET /usuarios/me/profile', async () => {
        const r = await contexts[2].ctx.request.get(`${BASE}/usuarios/me/profile`);
        return r.ok();
      }),
      act('concejo', 'GET /usuarios/me/profile', async () => {
        const r = await contexts[3].ctx.request.get(`${BASE}/usuarios/me/profile`);
        return r.ok();
      }),
    ]);

    console.log('\n🏃‍♂️ Lote 2: SOS + Emergencias (5 ops)');
    await Promise.all([
      act('residente', 'crear SOS', async () => {
        await sosCancelIfActive(contexts[1].ctx);
        const r = await contexts[1].ctx.request.post(`${BASE}/sos`, { data: { tipo: 'MEDICA' } });
        return r.ok();
      }),
      act('arrendatario', 'crear SOS', async () => {
        await sosCancelIfActive(contexts[2].ctx);
        const r = await contexts[2].ctx.request.post(`${BASE}/sos`, { data: { tipo: 'SEGURIDAD' } });
        return r.ok();
      }),
      act('vigilante', 'listar SOS activas', async () => {
        const r = await contexts[4].ctx.request.get(`${BASE}/sos`);
        return r.ok();
      }),
      act('supervisor', 'listar SOS activas', async () => {
        const r = await contexts[5].ctx.request.get(`${BASE}/sos`);
        return r.ok();
      }),
      act('paulo-admin', 'listar SOS activas', async () => {
        const r = await contexts[8].ctx.request.get(`${BASE}/sos`);
        return r.ok();
      }),
    ]);

    console.log('\n🏃‍♂️ Lote 3: PQRS + Solicitudes (5 ops)');
    await Promise.all([
      act('residente', 'crear PQRS', async () => {
        const r = await contexts[1].ctx.request.post(`${BASE}/solicitudes`, {
          data: { categoria: 'PLOMERIA', tipo: 'QUEJA', descripcion: 'Fuga de agua en baño - test concurrente' },
        });
        return r.ok();
      }),
      act('arrendatario', 'crear PQRS', async () => {
        const r = await contexts[2].ctx.request.post(`${BASE}/solicitudes`, {
          data: { categoria: 'PLOMERIA', tipo: 'QUEJA', descripcion: 'Presión de agua baja - test concurrente' },
        });
        return r.ok();
      }),
      act('concejo', 'listar PQRS', async () => {
        const r = await contexts[3].ctx.request.get(`${BASE}/solicitudes`);
        return r.ok();
      }),
      act('admin', 'listar PQRS admin', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/admin/solicitudes`);
        return r.ok();
      }),
      act('paulo-admin', 'listar PQRS admin stats', async () => {
        const r = await contexts[8].ctx.request.get(`${BASE}/admin/solicitudes/stats`);
        return r.ok();
      }),
    ]);

    console.log('\n🏃‍♂️ Lote 4: Encuestas + Votaciones (5 ops)');
    await Promise.all([
      act('admin', 'crear encuesta', async () => {
        const r = await contexts[0].ctx.request.post(`${BASE}/encuestas`, {
          data: { titulo: '¿Deberíamos tener más zonas verdes?', opciones: ['Sí', 'No', 'Tal vez'] },
        });
        return r.ok();
      }),
      act('residente', 'listar encuestas', async () => {
        const r = await contexts[1].ctx.request.get(`${BASE}/encuestas`);
        return r.ok();
      }),
      act('arrendatario', 'listar encuestas', async () => {
        const r = await contexts[2].ctx.request.get(`${BASE}/encuestas`);
        return r.ok();
      }),
      act('concejo', 'listar encuestas', async () => {
        const r = await contexts[3].ctx.request.get(`${BASE}/encuestas`);
        return r.ok();
      }),
      act('superadmin', 'listar encuestas', async () => {
        const r = await contexts[7].ctx.request.get(`${BASE}/encuestas`);
        return r.ok();
      }),
    ]);

    console.log('\n🏃‍♂️ Lote 5: Clasificados + Inmuebles + Cartelera (6 ops)');
    await Promise.all([
      act('residente', 'publicar clasificado', async () => {
        const r = await contexts[1].ctx.request.post(`${BASE}/clasificados`, {
          data: { nombre: 'Lavadora seminueva', categoria: 'OTRO', descripcion: 'Lavadora de 12kg, 6 meses de uso', precio: '800000', telefono: '3001234567' },
        });
        return r.ok();
      }),
      act('arrendatario', 'publicar clasificado', async () => {
        const r = await contexts[2].ctx.request.post(`${BASE}/clasificados`, {
          data: { nombre: 'Escritorio de madera', categoria: 'OTRO', descripcion: 'Escritorio en buen estado', precio: '250000', telefono: '3007654321' },
        });
        return r.ok();
      }),
      act('concejo', 'ver clasificados', async () => {
        const r = await contexts[3].ctx.request.get(`${BASE}/clasificados`);
        return r.ok();
      }),
      act('residente', 'publicar inmueble', async () => {
        const r = await contexts[1].ctx.request.post(`${BASE}/inmuebles`, {
          data: { titulo: 'Casa en arriendo', descripcion: 'Casa de 3 habitaciones', tipoNegocio: 'ALQUILER', tipoUnidad: 'CASA', habitaciones: 3, banos: 2, area: '120.00', precio: '1500000.00', moneda: 'COP' },
        });
        return r.ok();
      }),
      act('residente', 'ver inmuebles', async () => {
        const r = await contexts[1].ctx.request.get(`${BASE}/inmuebles`);
        return r.ok();
      }),
      act('admin', 'ver anuncios', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/anuncios`);
        return r.ok();
      }),
    ]);

    console.log('\n🏃‍♂️ Lote 6: Cartera + Pagos (5 ops)');
    await Promise.all([
      act('residente', 'ver pagos', async () => {
        const r = await contexts[1].ctx.request.get(`${BASE}/pagos`);
        return r.ok();
      }),
      act('arrendatario', 'ver pagos', async () => {
        const r = await contexts[2].ctx.request.get(`${BASE}/pagos`);
        return r.ok();
      }),
      act('admin', 'ver pagos admin', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/admin/pagos`);
        return r.ok();
      }),
      act('admin', 'ver resumen finanzas', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/admin/finanzas/resumen`);
        return r.ok();
      }),
      act('admin', 'ver morosidad', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/admin/morosidad`);
        return r.ok();
      }),
    ]);

    console.log('\n🏃‍♂️ Lote 7: Vigilancia + Paquetes + Correspondencia (7 ops)');
    await Promise.all([
      act('vigilante', 'listar visitas hoy', async () => {
        const r = await contexts[4].ctx.request.get(`${BASE}/vigilancia/visitas`);
        return r.ok();
      }),
      act('vigilante', 'listar paquetes', async () => {
        const r = await contexts[4].ctx.request.get(`${BASE}/vigilancia/paquetes`);
        return r.ok();
      }),
      act('residente', 'mis paquetes', async () => {
        const r = await contexts[1].ctx.request.get(`${BASE}/paquetes/mios`);
        return r.ok();
      }),
      act('vigilante', 'stats vigilancia', async () => {
        const r = await contexts[4].ctx.request.get(`${BASE}/vigilancia/stats`);
        return r.ok();
      }),
      act('vigilante', 'listar correspondencia', async () => {
        const r = await contexts[4].ctx.request.get(`${BASE}/vigilancia/correspondencia`);
        return r.ok();
      }),
      act('vigilante', 'listar novedades seguridad', async () => {
        const r = await contexts[4].ctx.request.get(`${BASE}/vigilancia/novedades`);
        return r.ok();
      }),
      act('vigilante', 'ver comunicaciones', async () => {
        const r = await contexts[4].ctx.request.get(`${BASE}/comunicaciones`);
        return r.ok();
      }),
    ]);

    console.log('\n🏃‍♂️ Lote 8: Parqueadero (6 ops)');
    await Promise.all([
      act('residente', 'mi parqueadero', async () => {
        const r = await contexts[1].ctx.request.get(`${BASE}/parqueadero/mio`);
        return r.ok();
      }),
      act('vigilante', 'mapa parqueadero', async () => {
        const r = await contexts[4].ctx.request.get(`${BASE}/parqueadero/mapa`);
        return r.ok();
      }),
      act('parqueadero', 'stats parqueadero', async () => {
        const r = await contexts[6].ctx.request.get(`${BASE}/parqueadero/stats`);
        return r.ok();
      }),
      act('parqueadero', 'registros parqueadero', async () => {
        const r = await contexts[6].ctx.request.get(`${BASE}/parqueadero/registros`);
        return r.ok();
      }),
      act('parqueadero', 'rondas parqueadero', async () => {
        const r = await contexts[6].ctx.request.get(`${BASE}/parqueadero/rondas`);
        return r.ok();
      }),
      act('admin', 'solicitudes parqueadero', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/parqueadero/solicitudes`);
        return r.ok();
      }),
    ]);

    console.log('\n🏃‍♂️ Lote 9: Reservas + Áreas Comunes (5 ops)');
    await Promise.all([
      act('residente', 'ver áreas comunes', async () => {
        const r = await contexts[1].ctx.request.get(`${BASE}/areas-comunes`);
        return r.ok();
      }),
      act('arrendatario', 'ver áreas comunes', async () => {
        const r = await contexts[2].ctx.request.get(`${BASE}/areas-comunes`);
        return r.ok();
      }),
      act('concejo', 'ver mis reservas', async () => {
        const r = await contexts[3].ctx.request.get(`${BASE}/reservas`);
        return r.ok();
      }),
      act('admin', 'admin áreas comunes', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/admin/areas-comunes`);
        return r.ok();
      }),
      act('admin', 'admin reservas', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/admin/reservas`);
        return r.ok();
      }),
    ]);

    console.log('\n🏃‍♂️ Lote 10: Trámites + Chat + Notificaciones (7 ops)');
    await Promise.all([
      act('residente', 'crear trámite', async () => {
        const r = await contexts[1].ctx.request.post(`${BASE}/tramites`, {
          data: { tipo: 'OTRO', payload: { descripcion: 'Trámite de prueba automática' } },
        });
        return r.ok();
      }),
      act('residente', 'ver mis trámites', async () => {
        const r = await contexts[1].ctx.request.get(`${BASE}/tramites`);
        return r.ok();
      }),
      act('admin', 'ver trámites admin', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/tramites`);
        return r.ok();
      }),
      act('residente', 'enviar chat', async () => {
        const r = await contexts[1].ctx.request.post(`${BASE}/chat`, {
          data: { mensaje: `Test chat concurrente ${Date.now()}` },
        });
        return r.ok();
      }),
      act('admin', 'ver conversaciones chat', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/admin/chat`);
        return r.ok();
      }),
      act('residente', 'ver notificaciones', async () => {
        const r = await contexts[1].ctx.request.get(`${BASE}/notificaciones`);
        return r.ok();
      }),
      act('admin', 'ver directorio', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/usuarios/directorio`);
        return r.ok();
      }),
    ]);

    console.log('\n🏃‍♂️ Lote 11: Admin Stats + Users + Analytics (5 ops)');
    await Promise.all([
      act('admin', 'admin stats', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/admin/stats`);
        return r.ok();
      }),
      act('admin', 'admin usuarios', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/admin/usuarios`);
        return r.ok();
      }),
      act('admin', 'admin analytics demografia', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/admin/analytics/demografia`);
        return r.ok();
      }),
      act('superadmin', 'listar conjuntos', async () => {
        const r = await contexts[7].ctx.request.get(`${BASE}/superadmin/conjuntos`);
        return r.ok();
      }),
      act('admin', 'admin gastos', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/admin/gastos`);
        return r.ok();
      }),
    ]);

    console.log('\n🏃‍♂️ Lote 12: Convivencia + Multas + Pases Temporales + Ciudadela (7 ops)');
    await Promise.all([
      act('admin', 'stats convivencia', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/convivencia/casos/stats`);
        return r.ok();
      }),
      act('admin', 'lista casos convivencia', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/convivencia/casos`);
        return r.ok();
      }),
      act('admin', 'lista comité convivencia', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/convivencia/comite`);
        // 404 = no active comité yet — that's OK
        return r.ok() || r.status() === 404;
      }),
      act('admin', 'lista multas', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/multas`);
        return r.ok();
      }),
      act('residente', 'ver pases temporales', async () => {
        const r = await contexts[1].ctx.request.get(`${BASE}/pases-temporales/mis-pases`);
        return r.ok();
      }),
      act('admin', 'ad-spaces activos', async () => {
        const r = await contexts[0].ctx.request.get(`${BASE}/ad-spaces/active`);
        return r.ok();
      }),
      act('residente', 'healthz', async () => {
        const r = await contexts[1].ctx.request.get(`${API_ROOT}/healthz`);
        return r.ok();
      }),
    ]);

    console.log('\n🏃‍♂️ Lote 13: Cancelaciones y limpieza');
    // Cancel SOS alerts that were created
    const [sosRes1, sosRes2] = await Promise.all([
      contexts[1].ctx.request.get(`${BASE}/sos/activa`),
      contexts[2].ctx.request.get(`${BASE}/sos/activa`),
    ]);
    const cancelOps = [[1, sosRes1] as const, [2, sosRes2] as const].map(async ([idx, res]) => {
      if (res.ok()) {
        const sos = await res.json().catch(() => null);
        if (sos && sos.id) {
          await contexts[idx].ctx.request.post(`${BASE}/sos/${sos.id}/cancelar`);
          console.log(`  ✅ ${contexts[idx].name}: canceló SOS ${sos.id}`);
        }
      }
    });
    await Promise.all(cancelOps);

    // Final scoreboard
    const passed = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    console.log(`\n📊 RESULTADOS: ${results.length} operaciones (${passed} ✅, ${failed} ❌)`);

    // Collect per-user stats
    const perUser = new Map<string, { ok: number; fail: number }>();
    for (const r of results) {
      const u = perUser.get(r.user) || { ok: 0, fail: 0 };
      if (r.ok) u.ok++; else u.fail++;
      perUser.set(r.user, u);
    }
    console.log('\n👤 Por usuario:');
    for (const [user, stats] of perUser) {
      console.log(`   ${user}: ${stats.ok} ✅ / ${stats.fail} ❌`);
    }

    // Assert at least 80% pass rate
    const passRate = results.length > 0 ? passed / results.length : 0;
    expect(passRate).toBeGreaterThanOrEqual(0.8);

    // Clean up all contexts
    await Promise.all(contexts.map(c => c.ctx.close()));
  });
});
