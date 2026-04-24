// Visual regression — páginas públicas (pre-auth).
// No requiere backend: con solo el frontend dev server alcanza.
// Playwright arranca vite automáticamente vía `webServer` en config.

import { test, expect } from '@playwright/test';
import { stabilize } from './helpers.js';

test.describe('public pages', () => {
  test('login', async ({ page }) => {
    await page.goto('/');
    await stabilize(page);
    await expect(page).toHaveScreenshot('login.png', { fullPage: true });
  });
});
