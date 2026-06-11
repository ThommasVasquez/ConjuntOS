import { Page } from '@playwright/test';

/**
 * Login via the API directly and set the auth cookie.
 * This is much faster than navigating to the login page for every test.
 */
export async function login(page: Page, email: string, password: string) {
  // Call the backend login API directly to get the cookie
  const response = await page.request.post('/api/v1/auth/login', {
    data: { email, password },
  });

  // The response sets ec_session as a cookie via Set-Cookie header.
  // Playwright automatically captures it for the page context.
  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()}`);
  }

  // Navigate to inicio to confirm we're authenticated
  await page.goto('/inicio', { waitUntil: 'domcontentloaded' });
}

export async function loginAsAdmin(page: Page) {
  await login(page, 'admin@demo.conjuntos.app', '123456789');
}

export async function loginAsResident(page: Page) {
  await login(page, 'residente@demo.conjuntos.app', '123456789');
}

export async function loginAsVigilante(page: Page) {
  await login(page, 'vigilante@demo.conjuntos.app', '123456789');
}
