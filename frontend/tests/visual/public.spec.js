// Visual regression — pages públicas (pre-auth).
// No requiere backend levantado con DB completa: con solo el frontend dev server
// alcanza, porque Login renderiza sin datos.

import { test, expect } from '@playwright/test';
import { stabilize } from './helpers.js';

test.describe('public pages', () => {
  test('login', async ({ page }) => {
    await page.goto('/');
    await stabilize(page);
    await expect(page).toHaveScreenshot('login.png', { fullPage: true });
  });

  test('login — estado de error', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"], input[name="email"]', 'noexiste@crmaosbike.cl');
    await page.fill('input[type="password"], input[name="password"]', 'mala');
    await page.click('button[type="submit"]');
    // Espera a que aparezca el mensaje de error, luego estabiliza.
    await page.waitForTimeout(800);
    await stabilize(page);
    await expect(page).toHaveScreenshot('login-error.png', { fullPage: true });
  });
});
