import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testMatch: ['**/prod-scenarios*', '**/prod-stress*', '**/prod-100users*', '**/prod-comprehensive*'],
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 180_000,
  expect: { timeout: 30_000 },

  use: {
    baseURL: 'https://app.conjuntos.app',
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
