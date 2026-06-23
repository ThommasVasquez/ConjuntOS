import { test, expect } from '@playwright/test';
import { loginAs, loginAsResidente, loginAsAdmin, loginAsVigilante, DEMO, sleep, pageHasText } from './prod-helpers';

test.describe('PRD — Comprehensive: All Pages & Interactions', () => {

  // ── SCENARIO J: Parqueadero — 4 pages ──────────────────────────
  test.describe('J — Parqueadero: Mapa, Vehiculos, Bitácora, Admin', () => {

    test('J1 — Residente ve su parqueadero (vehículos y celdas)', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/parqueadero', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /veh[ií]culo|celda|parqueadero|placa|moto|carro|estacionamiento|mi parqueadero/i);
      expect(hasContent).toBeTruthy();
    });

    test('J2 — Residente ve el mapa del parqueadero', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/mapa-parqueadero', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /mapa|celda|parqueadero|ocupado|disponible|piso|torre|parqueadero/i);
      expect(hasContent).toBeTruthy();
    });

    test('J3 — Encargado ve bitácora del parqueadero', async ({ page }) => {
      await loginAs(page, DEMO.parqueadero);
      await page.goto('/bitacora-parqueadero', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /bit[cá]cora|registro|ingreso|salida|ronda|parqueadero|checkpoint/i);
      expect(hasContent).toBeTruthy();
    });

    test('J4 — Admin ve panel de administración de parqueadero', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin-parqueadero', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /parqueadero|celda|veh[ií]culo|ronda|solicitud|estad[ií]stica|ocupación|pendiente/i);
      expect(hasContent).toBeTruthy();
    });

    test('J5 — Residente registra vehículo vía API', async ({ page }) => {
      await loginAsResidente(page);
      const unique = Date.now().toString(36);
      const res = await page.request.post('/api/v1/vehiculos', {
        data: { placa: `PZ${unique.slice(-4).toUpperCase()}`, marca: 'Toyota', modelo: 'Corolla', color: 'Rojo', tipo: 'CARRO' },
      });
      console.log(`   J5: POST /vehiculos → ${res.status()}`);
      expect([200, 201, 409]).toContain(res.status());
    });
  });

  // ── SCENARIO K: Chat Residente ↔ Admin ─────────────────────────
  test.describe('K — Chat: Residente envía mensaje, Admin responde', () => {

    test('K1 — Residente ve página de chat', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/chat', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /chat|mensaje|conversación|escribe|enviar|admin|administración|soporte/i);
      expect(hasContent).toBeTruthy();
    });

    test('K2 — Residente envía mensaje al chat', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/chat', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(2500);

      // Try resident chat API directly
      const msgRes = await page.request.post('/api/v1/chat', {
        data: { mensaje: `Mensaje de prueba automática ${Date.now()}` },
      });
      expect(msgRes.ok()).toBeTruthy();
    });

    test('K3 — Admin ve lista de conversaciones', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin-mensajes', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /mensaje|conversación|chat|residente|usuario|admin|bandeja|recibido/i);
      expect(hasContent).toBeTruthy();
    });

    test('K4 — Admin responde por API', async ({ page }) => {
      await loginAsAdmin(page);

      // Get list of conversations
      const listRes = await page.request.get('/api/v1/admin/chat');
      expect(listRes.ok()).toBeTruthy();
      const conversations = await listRes.json().catch(() => null);
      if (conversations && Array.isArray(conversations) && conversations.length > 0) {
        const firstUser = conversations[0];
        const userId = firstUser.usuario_id || firstUser.id;
        if (userId) {
          const replyRes = await page.request.post(`/api/v1/admin/chat/${userId}`, {
            data: { mensaje: 'Respuesta automática de prueba — gracias por escribirnos.' },
          });
          expect(replyRes.ok()).toBeTruthy();
        }
      }
    });
  });

  // ── SCENARIO L: Inmobiliaria ──────────────────────────────────
  test.describe('L — Inmobiliaria: Publicar y ver inmuebles', () => {

    test('L1 — Residente ve página de inmobiliaria', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/inmobiliaria', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /inmueble|venta|arriendo|alquiler|propiedad|apartamento|casa|local|piso/i);
      expect(hasContent).toBeTruthy();
    });

    test('L2 — Residente publica inmueble vía API', async ({ page }) => {
      await loginAsResidente(page);
      const res = await page.request.post('/api/v1/inmuebles', {
        data: {
          titulo: 'Apartamento en venta — prueba automática',
          descripcion: 'Hermoso apartamento de 80m2, 3 habitaciones, 2 baños.',
          tipoNegocio: 'VENTA',
          tipoUnidad: 'APARTAMENTO',
          habitaciones: 3,
          banos: 2,
          area: '80.00',
          precio: '350000000.00',
          moneda: 'COP',
          caracteristicas: ['Balcón', 'Parqueadero'],
        },
      });
      console.log(`   L2: POST /inmuebles → ${res.status()}`);
      expect([200, 201, 409]).toContain(res.status());
    });
  });

  // ── SCENARIO M: Directorio ─────────────────────────────────────
  test.describe('M — Directorio de Residentes', () => {

    test('M1 — Admin ve directorio de residentes', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/directorio', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /directorio|residente|nombre|torre|apto|teléfono|unidad|conjunto|vecino/i);
      expect(hasContent).toBeTruthy();
    });

    test('M2 — Vigilante ve directorio', async ({ page }) => {
      await loginAsVigilante(page);
      await page.goto('/directorio', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /directorio|residente|nombre|torre|apto|teléfono/i);
      expect(hasContent).toBeTruthy();
    });
  });

  // ── SCENARIO N: Admin Pages ────────────────────────────────────
  test.describe('N — Admin: Áreas, Banners, Residentes, PQRS', () => {

    test('N1 — Admin ve y gestiona áreas comunes', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin-areas', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /[áÁ]rea|com[uú]n|sal[uú]n|piscina|gimnasio|cancha|reserva|admin/i);
      expect(hasContent).toBeTruthy();
    });

    test('N2 — Admin ve panel de banners publicitarios', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin-banners', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /banner|publicidad|anuncio|ad|space|espacio|promoción|imagen/i);
      expect(hasContent).toBeTruthy();
    });

    test('N3 — Admin ve lista de residentes', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin-residentes', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /residente|usuario|unidad|rol|torre|apto|invitar|listado/i);
      expect(hasContent).toBeTruthy();
    });

    test('N4 — Invitar residente vía API', async ({ page }) => {
      await loginAsAdmin(page);
      const unique = Date.now().toString(36).slice(-6);
      const res = await page.request.post('/api/v1/admin/usuarios/invitar', {
        data: { email: `invitado-${unique}@prueba.conjuntos.app`, nombre: `Invitado ${unique}`, rol: 'PROPIETARIO', torre: 'B', apto: unique },
      });
      expect(res.ok()).toBeTruthy();
    });
  });

  // ── SCENARIO O: Novedades de Seguridad ─────────────────────────
  test.describe('O — Novedades de Seguridad', () => {

    test('O1 — Vigilante ve panel de novedades de seguridad', async ({ page }) => {
      await loginAsVigilante(page);
      await page.goto('/novedades-seguridad', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /novedad|seguridad|reporte|incidente|novedad|porter[ií]a|vigilancia/i);
      expect(hasContent).toBeTruthy();
    });

    test('O2 — Residente ve panel de novedades generales', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/novedades', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /novedad|noticia|comunicado|información|aviso|importante|conjunto/i);
      expect(hasContent).toBeTruthy();
    });

    test('O3 — Vigilante crea novedad vía API', async ({ page }) => {
      await loginAsVigilante(page);
      const res = await page.request.post('/api/v1/vigilancia/novedades', {
        data: { tipo: 'OTRO', descripcion: 'Novedad de prueba automática — portería funcionando correctamente.', severidad: 'BAJA' },
      });
      console.log(`   O3: POST /vigilancia/novedades → ${res.status()}`);
      expect([200, 201, 409]).toContain(res.status());
    });
  });

  // ── SCENARIO P: Pases Temporales ───────────────────────────────
  test.describe('P — Pases Temporales (Airbnb / Huéspedes)', () => {

    test('P1 — Residente ve página de pases temporales', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/pases-temporales', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /pase|temporal|hu[eé]sped|airbnb|invitado|visita|c[oó]digo|acceso/i);
      expect(hasContent).toBeTruthy();
    });
  });

  // ── SCENARIO Q: Comité de Convivencia ──────────────────────────
  test.describe('Q — Comité de Convivencia: Vista y casos', () => {

    test('Q1 — Admin ve comité de convivencia', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/comite-convivencia', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /comit[eé]|convivencia|caso|miembro|mediación|acta|conflicto|conciliación/i);
      expect(hasContent).toBeTruthy();
    });

    test('Q2 — Admin consulta stats de convivencia vía API', async ({ page }) => {
      await loginAsAdmin(page);
      const res = await page.request.get('/api/v1/convivencia/casos/stats');
      expect(res.ok()).toBeTruthy();
    });
  });

  // ── SCENARIO R: Citofonía ───────────────────────────────────────
  test.describe('R — Citofonía: Página y marcador', () => {

    test('R1 — Residente ve página de citofonía', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/citofonia', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /citofon[ií]a|llamar|marcar|teléfono|timbre|portero|videollamada|audio/i);
      expect(hasContent).toBeTruthy();
    });
  });

  // ── SCENARIO S: Asistente / Otto AI ────────────────────────────
  test.describe('S — Otto AI: Asistente virtual', () => {

    test('S1 — Residente ve página del asistente', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/asistente', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /asistente|otto|pregunta|ia|inteligencia|artificial|ley|675|ayuda|legal/i);
      expect(hasContent).toBeTruthy();
    });

    test('S2 — Admin consulta copiloto vía API', async ({ page }) => {
      await loginAsAdmin(page);
      const res = await page.request.post('/api/v1/ai/asistente', {
        data: { pregunta: '¿Qué dice la ley 675 sobre las asambleas de copropietarios?' },
        timeout: 30_000,
      });
      // 503 = no API key configured; 502 = AI upstream proxy error — both acceptable per spec (Law 4)
      expect([200, 502, 503]).toContain(res.status());
    });
  });

  // ── SCENARIO T: Superadmin ─────────────────────────────────────
  test.describe('T — Superadmin: Gestión de conjuntos', () => {

    test('T1 — Superadmin ve página de superadmin', async ({ page }) => {
      await loginAs(page, DEMO.superadmin);
      await page.goto('/superadmin', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /superadmin|conjunto|copropiedad|plan|nit|dirección|subdominio|configuración/i);
      expect(hasContent).toBeTruthy();
    });

    test('T2 — Superadmin lista conjuntos vía API', async ({ page }) => {
      await loginAs(page, DEMO.superadmin);
      const res = await page.request.get('/api/v1/superadmin/conjuntos', { timeout: 45_000 });
      console.log(`   T2: GET /superadmin/conjuntos → ${res.status()}`);
      expect(res.ok()).toBeTruthy();
    });
  });

  // ── SCENARIO U: Visitantes / Control Visitas / Seguridad ──────
  test.describe('U — Visitantes, Control Visitas y Seguridad', () => {

    test('U1 — Residente programa visita vía API', async ({ page }) => {
      await loginAsResidente(page);
      const res = await page.request.post('/api/v1/visitas', {
        data: { nombre: 'Carlos Test', tipo: 'PEATONAL', observacion: 'Visita de prueba automática' },
      });
      expect(res.ok()).toBeTruthy();
    });

    test('U2 — Residente ve página de visitantes', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/visitantes', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /visita|visitante|programar|qr|c[oó]digo|agendada|preregistro|invitado/i);
      expect(hasContent).toBeTruthy();
    });

    test('U3 — Vigilante ve control de visitas', async ({ page }) => {
      await loginAsVigilante(page);
      await page.goto('/control-visitas', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /control|visita|ingreso|porter[ií]a|registro|hoy|scan|qr/i);
      expect(hasContent).toBeTruthy();
    });

    test('U4 — Vigilante ve página de seguridad', async ({ page }) => {
      await loginAsVigilante(page);
      await page.goto('/seguridad', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /seguridad|cctv|c[áa]mara|monitoreo|alarma|sensor|vigilancia|panel/i);
      expect(hasContent).toBeTruthy();
    });
  });

  // ── SCENARIO V: Asambleas + Páginas restantes ──────────────────
  test.describe('V — Asambleas, Pagos, Mi Estancia', () => {

    test('V1 — Residente ve página de asambleas', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/asambleas', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /asamblea|sesi[oó]n|votaci[oó]n|qu[oó]rum|asistencia|orden|d[ií]a|reuni[oó]n|copropietario/i);
      expect(hasContent).toBeTruthy();
    });

    test('V2 — Admin crea sesión de asamblea vía API', async ({ page }) => {
      await loginAsAdmin(page);
      const res = await page.request.put('/api/v1/asambleas/activa/session', {
        data: { sessionState: { phase: 'apertura' }, activa: true, version: 1 },
      });
      console.log(`   V2: PUT /asambleas/activa/session → ${res.status()}`);
      expect([200, 201, 409, 404]).toContain(res.status());
    });

    test('V3 — Residente ve página de pagos', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/pagos', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /pago|cuota|pendiente|pagado|vencido|m[ée]todo|recibo|factura|cartera|deuda/i);
      expect(hasContent).toBeTruthy();
    });

    test('V4 — Huésped ve Mi Estancia', async ({ page }) => {
      await loginAs(page, DEMO.arrendatario);
      await page.goto('/mi-estancia', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      const hasContent = await pageHasText(page, /estancia|estad[ií]a|hu[eé]sped|check|entrada|salida|temporal|reserva|alojamiento/i);
      expect(hasContent).toBeTruthy();
    });
  });
});
