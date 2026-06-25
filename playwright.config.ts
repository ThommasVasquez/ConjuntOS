import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Warm the dev-server route compiler once before tests so cold-compile latency
  // (the heaviest route, /seguridad, is ~17s) never blows a test budget. The
  // failures it caused were infra-only, not app bugs. Skip with PW_NO_WARM=1.
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,       // sequential — tests share DB state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                 // single worker — shared DB
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: process.env.PW_BASE_URL || 'http://localhost:3000',
    navigationTimeout: 45_000, // tolerate a cold first compile if warm-up is skipped
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
