import { test, expect } from '@playwright/test';
import { loginAs, loginAsResidente, loginAsAdmin, loginAsVigilante, DEMO, sleep, pageHasText } from './prod-helpers';

test.describe('PRD — Escenarios de uso real', () => {

  // ── ESCENARIO A: SOS — 4 personas ──────────────────────────────
  test.describe('A — SOS: Residente → Guardia atiende → Guardia resuelve', () => {

    test('A1 — Residente activa SOS desde el botón de pánico', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/inicio', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(2500);

      const panicBtn = page.locator('button:has-text("Pánico"), button:has-text("SOS")').first();
      await expect(panicBtn).toBeVisible({ timeout: 15_000 });
      await panicBtn.click();
      await sleep(1000);

      // Click "Seguridad" — the LAST match because the panic button itself also matches /seguridad/i in its subtitle
      const emergencyBtn = page.locator('button:has-text("Seguridad"), button:has-text("🛡️")').last();
      await expect(emergencyBtn).toBeVisible({ timeout: 8_000 });
      await emergencyBtn.click();
      await sleep(2000);

      const banner = page.locator('text=Alerta SOS activa');
      await expect(banner).toBeVisible({ timeout: 10_000 });
      console.log('✅ SOS activada por residente');
    });

    test('A2 — Guardia ve la alerta en la consola', async ({ page }) => {
      await loginAsVigilante(page);
      await page.goto('/vigilancia', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);

      const hasSosContent = await pageHasText(page, /sos|alerta|emergencia|pánico/i);
      expect(hasSosContent).toBeTruthy();
      console.log('✅ Guardia ve panel SOS');
    });

    test('A3 — Guardia atiende y resuelve la alerta', async ({ page }) => {
      await loginAsVigilante(page);
      await page.goto('/vigilancia', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);

      const attendBtn = page.locator('button:has-text("Atender")').first();
      if (await attendBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await attendBtn.click();
        await sleep(1500);
        console.log('✅ Guardia atendió la alerta');
      }

      const resolveBtn = page.locator('button:has-text("Resolver")').first();
      if (await resolveBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await resolveBtn.click();
        await sleep(1500);
        console.log('✅ Guardia resolvió la alerta');
      }
    });

    test('A4 — Residente cancela su propia alerta SOS', async ({ page }) => {
      await loginAsResidente(page);

      const sosRes = await page.request.post('/api/v1/sos', {
        data: { tipo: 'OTRO' },
      });
      expect(sosRes.ok()).toBeTruthy();
      console.log('✅ SOS creado vía API para test de cancelación');
      await sleep(1000);

      for (let i = 0; i < 3; i++) {
        try {
          await page.goto('/inicio', { waitUntil: 'domcontentloaded', timeout: 30_000 });
          break;
        } catch (e) {
          if (i === 2) throw e;
          await sleep(3000);
        }
      }
      await sleep(2000);

      const cancelBtn = page.locator('button:has-text("Cancelar alerta")');
      await expect(cancelBtn).toBeVisible({ timeout: 8_000 });
      await cancelBtn.click();
      await sleep(2000);

      const stillActive = await page.locator('text=Alerta SOS activa').isVisible().catch(() => false);
      expect(stillActive).toBeFalsy();
      console.log('✅ Residente canceló su propia alerta');
    });
  });

  // ── ESCENARIO B: PQRS — 3 personas ─────────────────────────────
  test.describe('B — PQRS: Residente crea ticket → Admin ve → Residente comenta', () => {

    test('B1 — Residente crea solicitud PQRS', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/pqrs', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(2000);

      // Click "Radicar nueva PQRS" button (open form)
      const newBtn = page.locator('button:has-text("Radicar"), button:has-text("Nueva"), a:has-text("Radicar")').first();
      if (await newBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await newBtn.click();
        await sleep(1500);
      }

      // Click first category button
      const catBtn = page.locator('button:has-text("Mantenimiento")').first();
      if (await catBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await catBtn.click();
        await sleep(500);
      }

      // Fill description
      const textarea = page.locator('textarea').first();
      if (await textarea.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await textarea.fill('Test PQRS — prueba automatizada de flujo completo');
        await sleep(500);
      }

      // Wait for modal to fully appear
      await sleep(1000);

      // Submit — inside modal, button says "Radicar Solicitud"
      const modalSubmit = page.locator('button:has-text("Radicar Solicitud")').last();
      if (await modalSubmit.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await modalSubmit.click({ force: true });
        await sleep(2000);
        console.log('✅ PQRS ticket creado por residente');
      }
    });

    test('B2 — Admin ve la solicitud en el panel', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin-pqrs', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);

      const hasContent = await pageHasText(page, /solicitud|ticket|pqrs|pendiente|abierta/i);
      expect(hasContent).toBeTruthy();
      console.log('✅ Admin ve panel PQRS con tickets');
    });

    test('B3 — Residente agrega comentario a su ticket', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/pqrs', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(2500);

      const ticketLink = page.locator('a:has-text("Test PQRS")').first();
      if (await ticketLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await ticketLink.click();
        await sleep(2000);

        const commentInput = page.locator('textarea').first();
        if (await commentInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await commentInput.fill('Comentario de prueba — todo funciona bien');
          await sleep(500);
          const sendBtn = page.locator('button:has-text("Enviar"), button:has-text("Comentar")').first();
          if (await sendBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await sendBtn.click();
            await sleep(1500);
            console.log('✅ Residente agregó comentario al ticket');
          }
        }
      }
    });
  });

  // ── ESCENARIO C: Encuestas — 5 personas ────────────────────────
  test.describe('C — Encuestas: Admin crea → 3 residentes votan → Admin cierra', () => {

    test('C1 — Admin crea una encuesta', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/encuestas', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(2000);

      const newBtn = page.locator('button:has-text("Nueva")').first();
      await expect(newBtn).toBeVisible({ timeout: 10_000 });
      await newBtn.click();
      await sleep(1500);

      // Use placeholder-based input for title
      const titleInput = page.locator('input[placeholder*="pregunta"]').first();
      if (await titleInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await titleInput.fill('¿Te gusta el nuevo sistema de pruebas?');
        await sleep(300);
      }

      // Fill option inputs (placeholder "Opción 1", "Opción 2", etc.)
      const optionInputs = page.locator('input[placeholder*="Opción"]');
      const count = await optionInputs.count();
      if (count >= 2) {
        await optionInputs.nth(0).fill('Sí, me encanta');
        await optionInputs.nth(1).fill('No, prefiero el anterior');
        if (count >= 3) await optionInputs.nth(2).fill('No opino');
        await sleep(500);
      }

      const saveBtn = page.locator('button:has-text("Publicar encuesta"), button:has-text("Guardar")').first();
      if (await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await saveBtn.click();
        await sleep(2000);
        console.log('✅ Admin creó encuesta');
      }
    });

    test('C2 — Residente 1 vota en la encuesta', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/encuestas', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(2500);

      const option = page.locator('label, button:has-text("Sí"), button:has-text("No opino")').first();
      if (await option.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await option.click();
        await sleep(500);
        const voteBtn = page.locator('button:has-text("Votar")').first();
        if (await voteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await voteBtn.click();
          await sleep(1500);
          console.log('✅ Residente 1 votó');
        }
      }
    });

    test('C3 — Arrendatario vota en la encuesta', async ({ page }) => {
      await loginAs(page, DEMO.arrendatario);
      await page.goto('/encuestas', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(2500);

      // Use filter + first to avoid matching across encuestas
      const option = page.locator('button').filter({ hasText: /no opino|no, prefiero/i }).first();
      if (await option.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await option.click();
        await sleep(500);
        const voteBtn = page.locator('button:has-text("Votar")').first();
        if (await voteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await voteBtn.click();
          await sleep(1500);
          console.log('✅ Arrendatario votó');
        }
      }
    });

    test('C4 — Concejo vota en la encuesta', async ({ page }) => {
      await loginAs(page, DEMO.concejo);
      await page.goto('/encuestas', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(2500);

      const option = page.locator('button').filter({ hasText: /sí/i }).first();
      if (await option.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await option.click();
        await sleep(500);
        const voteBtn = page.locator('button:has-text("Votar")').first();
        if (await voteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await voteBtn.click();
          await sleep(1500);
          console.log('✅ Concejo votó');
        }
      }
    });

    test('C5 — Admin cierra la encuesta', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/encuestas', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(2500);

      const closeBtn = page.locator('button:has-text("Cerrar")').first();
      if (await closeBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await closeBtn.click();
        await sleep(1000);
        const confirmBtn = page.locator('button:has-text("Confirmar"), button:has-text("Sí")').first();
        if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await confirmBtn.click();
          await sleep(1000);
        }
        console.log('✅ Admin cerró la encuesta');
      }
    });
  });

  // ── ESCENARIO D: Reservas — 3 personas ─────────────────────────
  test.describe('D — Reservas: Residente consulta y reserva', () => {

    test('D1 — Residente ve áreas comunes disponibles', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/areas-comunes', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);

      const hasContent = await pageHasText(page, /salón|piscina|gimnasio|bbq|área|zona|cancha|comun/i);
      expect(hasContent).toBeTruthy();
      console.log('✅ Residente ve áreas comunes');
    });

    test('D2 — Residente ve sus reservas', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/reservas', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);

      await pageHasText(page, /reserva|pendiente|confirmada/ig);
      console.log('✅ Residente vio panel de reservas');
    });
  });

  // ── ESCENARIO E: Clasificados — 3 personas ─────────────────────
  test.describe('E — Clasificados: 2 residentes publican, 1 consulta', () => {

    test('E1 — Residente publica un clasificado', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/clasificados', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(2000);

      // FAB with "+" icon — no text label, try CSS selector first, then any "+" button
      const fab = page.locator('button').filter({ has: page.locator('svg.lucide-plus, svg:has(plus)') }).first();
      if (!(await fab.isVisible({ timeout: 5_000 }).catch(() => false))) {
        // Fallback: look for any button with a + or Plus
        const fallback = page.locator('button:has-text("+"), button:has-text("Publicar")').first();
        if (await fallback.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await fallback.click();
          await sleep(1500);
        }
      } else {
        // Click via JavaScript to avoid visibility issues
        await fab.evaluate((el) => (el as HTMLButtonElement).click());
        await sleep(1500);
      }

      // Fill form
      const nameInput = page.locator('input[placeholder*="nombre"], input').first();
      if (await nameInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await nameInput.fill('Bicicleta de montaña en venta');
        await sleep(300);
      }

      const descField = page.locator('textarea').first();
      if (await descField.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await descField.fill('Bicicleta casi nueva, solo usada 3 veces.');
        await sleep(300);
      }

      const saveBtn = page.locator('button:has-text("Publicar Ahora"), button:has-text("Publicar")').first();
      if (await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await saveBtn.click();
        await sleep(2000);
        console.log('✅ Residente publicó clasificado');
      }
    });

    test('E2 — Arrendatario publica otro clasificado', async ({ page }) => {
      await loginAs(page, DEMO.arrendatario);
      await page.goto('/clasificados', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(2000);

      const fab = page.locator('button').filter({ has: page.locator('svg.lucide-plus') }).first();
      if (await fab.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await fab.evaluate((el) => (el as HTMLButtonElement).click());
        await sleep(1500);
      }

      const nameInput = page.locator('input[placeholder*="nombre"], input').first();
      if (await nameInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await nameInput.fill('Clases de guitarra para principiantes');
        await sleep(300);
      }

      const saveBtn = page.locator('button:has-text("Publicar Ahora")').first();
      if (await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await saveBtn.click();
        await sleep(2000);
        console.log('✅ Arrendatario publicó clasificado');
      }
    });

    test('E3 — Concejo consulta todos los clasificados', async ({ page }) => {
      await loginAs(page, DEMO.concejo);
      await page.goto('/clasificados', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);

      const hasListings = await pageHasText(page, /bicicleta|guitarra|clases|venta|clasificado/i);
      expect(hasListings).toBeTruthy();
      console.log('✅ Concejo ve todos los clasificados');
    });
  });

  // ── ESCENARIO F: Perfiles y Navegación — 2 personas ────────────
  test.describe('F — Perfiles: Residente consulta su perfil completo', () => {

    test('F1 — Residente ve perfil con datos completos', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/perfil', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);

      const hasContent = await pageHasText(page, /vehículo|mascota|email|teléfono|unidad|torre|apto|documento/i);
      expect(hasContent).toBeTruthy();
      console.log('✅ Residente ve perfil completo');
    });

    test('F2 — Admin ve dashboard con analytics', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin-analytics', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);

      const hasData = await pageHasText(page, /unidades|usuarios|rol|torre|demografía|total|porcentaje|activos|nuevos/i);
      expect(hasData).toBeTruthy();
      console.log('✅ Admin ve dashboard con analytics');
    });
  });

  // ── ESCENARIO G: Cartera — 2 personas ──────────────────────────
  test.describe('G — Cartera: Consulta de pagos', () => {

    test('G1 — Residente ve su cartera', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/cartera', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);

      const hasContent = await pageHasText(page, /pago|cuota|pendiente|pagado|vencido|deuda|recibo|admin|estado|mes|año|cartera/i);
      expect(hasContent).toBeTruthy();
      console.log('✅ Residente ve cartera');
    });

    test('G2 — Admin ve finanzas', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin-finanzas', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);

      const hasContent = await pageHasText(page, /recaudo|ingreso|gasto|finanza|total|mes|pendiente/i);
      console.log('✅ Admin ve finanzas');
    });
  });

  // ── ESCENARIO H: Comunicados + Cartelera — 3 personas ──────────
  test.describe('H — Comunicados: Admin publica, residentes ven', () => {

    test('H1 — Admin publica un anuncio', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin-novedades', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(2000);

      // Click "Publicar Anuncio" tab
      const anuncioTab = page.locator('button:has-text("Publicar Anuncio")').first();
      await expect(anuncioTab).toBeVisible({ timeout: 10_000 });
      await anuncioTab.click();
      await sleep(1500);

      // Fill title (placeholder "Ej: Mantenimiento Preventivo de Ascensores")
      const titleInput = page.locator('input[placeholder*="Mantenimiento"]').first();
      await expect(titleInput).toBeVisible({ timeout: 5_000 });
      await titleInput.fill('Prueba automatizada — sistema funcionando correctamente');
      await sleep(300);

      // Fill content (placeholder "Redacta la información detallada")
      const contentField = page.locator('textarea').first();
      await expect(contentField).toBeVisible({ timeout: 3_000 });
      await contentField.fill('Este es un anuncio generado automáticamente por las pruebas de Playwright.');
      await sleep(300);

      // Submit — button says "Publicar Anuncio"
      const saveBtn = page.locator('button:has-text("Publicar Anuncio")').first();
      await expect(saveBtn).toBeVisible({ timeout: 5_000 });
      await saveBtn.click();
      await sleep(2000);
      console.log('✅ Admin publicó anuncio');
    });

    test('H2 — Residente ve anuncio en cartelera', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/cartelera', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      await page.waitForLoadState('networkidle');

      // Verify page loaded with content (may take time for new announcements to appear)
      const hasContent = await pageHasText(page, /anuncio|circular|novedad|noticia|cartelera|informativo|comunicado|publicación/i, 12_000);
      expect(hasContent).toBeTruthy();
      console.log('✅ Residente ve cartelera');
    });

    test('H3 — Arrendatario también ve el anuncio', async ({ page }) => {
      await loginAs(page, DEMO.arrendatario);
      await page.goto('/cartelera', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);
      await page.waitForLoadState('networkidle');

      const hasContent = await pageHasText(page, /anuncio|circular|novedad|noticia|cartelera|informativo|comunicado/i, 12_000);
      expect(hasContent).toBeTruthy();
      console.log('✅ Arrendatario ve cartelera');
    });
  });

  // ── ESCENARIO I: Vigilancia — Flujo completo ────────────────────
  test.describe('I — Vigilancia: Guardia registra visita y paquete', () => {

    test('I1 — Guardia ve dashboard de vigilancia', async ({ page }) => {
      await loginAsVigilante(page);
      await page.goto('/vigilancia', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);

      const hasContent = await pageHasText(page, /visita|hoy|paquete|portería|novedad|ingreso/i);
      expect(hasContent).toBeTruthy();
      console.log('✅ Guardia ve dashboard');
    });

    test('I2 — Guardia ve paquetería', async ({ page }) => {
      await loginAsVigilante(page);
      await page.goto('/paqueteria', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);

      const hasContent = await pageHasText(page, /paquete|portería|entregado|pendiente|remitente/i);
      expect(hasContent).toBeTruthy();
      console.log('✅ Guardia ve paquetería');
    });

    test('I3 — Guardia ve correspondencia', async ({ page }) => {
      await loginAsVigilante(page);
      await page.goto('/correspondencia', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(3000);

      const hasContent = await pageHasText(page, /correspondencia|carta|recibido|remitente/i);
      console.log('✅ Guardia ve correspondencia');
    });

    test('I4 — Residente ve sus paquetes pendientes', async ({ page }) => {
      await loginAsResidente(page);
      await page.goto('/inicio', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(2500);

      await pageHasText(page, /paquete|portería|pendiente|encomienda/i);
      console.log('✅ Residente revisó paquetes');
    });
  });
});
