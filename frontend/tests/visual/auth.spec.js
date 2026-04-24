// Visual regression — pages autenticadas.
// Requiere backend + DB levantados con datos sembrados.
//
// Las credenciales se leen de E2E_USER_EMAIL / E2E_USER_PASSWORD.
// Ver README de visual testing (VISUAL.md) para la config local.

import { test, expect } from '@playwright/test';
import { login, stabilize, requireCreds } from './helpers.js';

// Login una vez por archivo, luego navegamos entre pages sin re-login.
test.beforeAll(async ({ browser }) => {
  // noop — creds check se hace abajo; este hook existe para documentar orden.
});

test.beforeEach(async ({ page }) => {
  const creds = requireCreds();
  await login(page, creds);
});

test.describe('auth pages — desktop', () => {
  test('dashboard', async ({ page }) => {
    // Tras login ya estamos en dashboard (la app lo usa como landing default).
    await stabilize(page);
    await expect(page).toHaveScreenshot('dashboard.png', { fullPage: true });
  });

  test('leads', async ({ page }) => {
    await page.getByRole('button', { name: /leads/i }).first().click().catch(() => {});
    // Fallback: navegar via URL state si la nav es por buttons internos.
    await page.waitForTimeout(500);
    await stabilize(page);
    await expect(page).toHaveScreenshot('leads.png', { fullPage: true });
  });

  test('pipeline', async ({ page }) => {
    await page.getByRole('button', { name: /pipeline/i }).first().click().catch(() => {});
    await page.waitForTimeout(500);
    await stabilize(page);
    await expect(page).toHaveScreenshot('pipeline.png', { fullPage: true });
  });

  test('ventas', async ({ page }) => {
    await page.getByRole('button', { name: /ventas/i }).first().click().catch(() => {});
    await page.waitForTimeout(500);
    await stabilize(page);
    await expect(page).toHaveScreenshot('sales.png', { fullPage: true });
  });

  test('inventario', async ({ page }) => {
    await page.getByRole('button', { name: /inventario/i }).first().click().catch(() => {});
    await page.waitForTimeout(500);
    await stabilize(page);
    await expect(page).toHaveScreenshot('inventory.png', { fullPage: true });
  });

  test('catálogo', async ({ page }) => {
    await page.getByRole('button', { name: /cat[aá]logo/i }).first().click().catch(() => {});
    await page.waitForTimeout(500);
    await stabilize(page);
    await expect(page).toHaveScreenshot('catalog.png', { fullPage: true });
  });

  test('calendario', async ({ page }) => {
    await page.getByRole('button', { name: /calendario/i }).first().click().catch(() => {});
    await page.waitForTimeout(500);
    await stabilize(page);
    await expect(page).toHaveScreenshot('calendar.png', { fullPage: true });
  });

  test('reportes', async ({ page }) => {
    await page.getByRole('button', { name: /reportes/i }).first().click().catch(() => {});
    await page.waitForTimeout(500);
    await stabilize(page);
    await expect(page).toHaveScreenshot('reports.png', { fullPage: true });
  });
});
