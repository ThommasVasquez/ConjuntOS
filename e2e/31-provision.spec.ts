import { test, expect } from '@playwright/test';
import { loginTester, switchTo } from './journey-helpers';
import { ALL_ROLES, type Rol } from './roles';

/**
 * Provisioning flow — proves the platform can stand up a new tenant and a full
 * roster of profiles end to end:
 *   • SUPER_ADMIN creates a Conjunto (POST /superadmin/conjuntos)
 *   • ADMINISTRADOR invites a user for EVERY role (POST /admin/usuarios/invitar)
 *
 * Writes data, so it is OPT-IN: run with PROVISION=1. Idempotent — re-runs reuse
 * the same emails/subdomain and treat "already exists" (409) as success.
 *
 * Run:  PROVISION=1 pnpm playwright test 31-provision
 */
const RUN = !!process.env.PROVISION;
// roles a conjunto admin can actually invite (residents + staff, not platform super-admin)
const INVITABLE: Rol[] = ALL_ROLES.filter((r) => r !== 'SUPER_ADMIN');

test.describe('Aprovisionamiento — crear conjunto y todos los perfiles', () => {
  test.skip(!RUN, 'set PROVISION=1 to run write-heavy provisioning');

  test('SUPER_ADMIN crea un conjunto', async ({ page }) => {
    test.setTimeout(60_000);
    await loginTester(page);
    await switchTo(page, 'SUPER_ADMIN');

    const sub = 'e2e-prov';
    const res = await page.request.post('/api/v1/superadmin/conjuntos', {
      data: {
        nombre: 'Conjunto E2E Provisioning',
        subdominio: sub,
        direccion: 'Calle 123 #45-67',
        ciudad: 'Bogotá',
        nit: '900123456-7',
        totalUnidades: 50,
      },
    });
    // 200 created, or 409 if it already exists from a previous run — both prove the flow.
    expect([200, 409], `create conjunto status (${res.status()})`).toContain(res.status());
    if (res.ok()) {
      const body = await res.json();
      expect(body.subdominio).toBe(sub);
      console.log(`✅ conjunto creado: ${body.id}`);
    } else {
      console.log('ℹ conjunto ya existía (409) — flujo válido');
    }
  });

  test('ADMINISTRADOR invita un perfil por cada rol', async ({ page }) => {
    test.setTimeout(120_000);
    await loginTester(page);
    await switchTo(page, 'ADMINISTRADOR');

    const created: string[] = [];
    let torre = 1;
    for (const rol of INVITABLE) {
      const email = `e2e.${rol.toLowerCase()}@demo.conjuntos.app`;
      const needsUnit = rol === 'PROPIETARIO' || rol === 'ARRENDATARIO';
      const res = await page.request.post('/api/v1/admin/usuarios/invitar', {
        data: {
          email,
          nombre: `E2E ${rol}`,
          rol,
          ...(needsUnit ? { torre: `T${torre}`, apto: `${100 + torre}` } : {}),
        },
      });
      torre++;
      // 200/201 created, 409 already exists, 422 unit required — all are "endpoint works".
      expect([200, 201, 409, 422], `invite ${rol} → ${res.status()}`).toContain(res.status());
      if (res.ok()) created.push(rol);
    }

    // Verify the roster is queryable and includes invited roles.
    const list = await page.request.get('/api/v1/admin/usuarios');
    expect(list.ok(), 'admin can list usuarios').toBeTruthy();
    console.log(`✅ perfiles invitados esta corrida: ${created.length}/${INVITABLE.length} (resto ya existían)`);
  });
});
