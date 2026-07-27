import { defineConfig, devices } from '@playwright/test';

/**
 * Fase 0 de PLAN_CORRECCION_PREVENTA.md: primer test E2E real de este repo.
 * Reutiliza el dev server si ya está corriendo (normal en desarrollo — Next
 * bloquea un segundo proceso en el mismo directorio); en CI arranca uno propio.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
