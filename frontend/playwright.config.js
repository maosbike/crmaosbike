// Playwright config — visual regression para crmaosbike frontend.
// Docs: https://playwright.dev/docs/test-configuration
//
// Uso local:
//   npm run visual            → corre los tests y falla si algún screenshot difiere.
//   npm run visual:update     → actualiza los snapshots baseline tras un cambio intencional.
//   npm run visual:debug      → abre el UI mode de Playwright para debugging.
//
// Variables de entorno esperadas (definir en .env.local del frontend o exportar):
//   E2E_BASE_URL        URL donde corre la app (default: http://localhost:5173)
//   E2E_USER_EMAIL      Email de un usuario de prueba (ej: admin@crmaosbike.cl)
//   E2E_USER_PASSWORD   Contraseña del usuario (ej: maosbike2024)
//   E2E_BACKEND_URL     URL del backend si no es el proxy de vite (opcional)

import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: './tests/visual',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      // Tolerancia razonable para evitar falsos positivos por anti-aliasing
      // o render sutil entre corridas.
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    },
  },
  // Corremos serialmente para evitar interferencia de auth/sesión entre tests.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Evita parpadeos por transiciones entre corridas.
    launchOptions: {
      args: ['--disable-web-animations'],
    },
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
  // No levantamos webServer automáticamente: el usuario corre `npm run dev` del
  // frontend + backend por separado, y luego `npm run visual`. Así evitamos
  // acoplar este script a la inicialización del stack completo (DB, etc).
});
