import { BrowserContext, Page, test } from '@playwright/test';

export const PAULO = { email: 'paulo@conjuntos.app', password: 'Md5891129Ae$' };

export const DEMO = {
  admin:     { email: 'admin@demo.conjuntos.app',     password: '123456789' },
  residente: { email: 'residente@demo.conjuntos.app', password: '123456789' },
  arrendatario: { email: 'arrendatario@demo.conjuntos.app', password: '123456789' },
  concejo:   { email: 'concejo@demo.conjuntos.app',   password: '123456789' },
  vigilante: { email: 'vigilante@demo.conjuntos.app', password: '123456789' },
  supervisor: { email: 'supervisor@demo.conjuntos.app', password: '123456789' },
  parqueadero: { email: 'parqueadero@demo.conjuntos.app', password: '123456789' },
  superadmin: { email: 'superadmin@demo.conjuntos.app', password: '123456789' },
};

export async function loginAs(page: Page, creds: { email: string; password: string }, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await page.request.post('/api/v1/auth/login', {
        data: creds,
        timeout: 30_000,
      });
      if (!response.ok()) throw new Error(`Login failed: ${response.status()}`);
      await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
      await sleep(1500);
      return;
    } catch (e) {
      if (i === retries) throw e;
      await sleep(2000);
    }
  }
}

export async function loginAsResidente(page: Page) { return loginAs(page, DEMO.residente); }
export async function loginAsAdmin(page: Page) { return loginAs(page, DEMO.admin); }
export async function loginAsVigilante(page: Page) { return loginAs(page, DEMO.vigilante); }

export async function switchRole(page: Page, rol: string) {
  const res = await page.request.post('/api/v1/auth/switch-role', { data: { rol } });
  if (!res.ok()) throw new Error(`switch-role to ${rol} failed: ${res.status()}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1000);
}

export async function apiLogin(context: BrowserContext, creds: { email: string; password: string }) {
  const req = await context.request.post('https://api.conjuntos.app/api/v1/auth/login', {
    data: creds,
  });
  if (!req.ok()) throw new Error(`API login failed: ${req.status()}`);
  return req;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function pageHasText(page: Page, regex: RegExp, timeout = 8000) {
  try {
    const text = await page.textContent('body', { timeout });
    return regex.test(text || '');
  } catch { return false; }
}
