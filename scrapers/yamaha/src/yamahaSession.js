// Sesión Playwright contra YamaImport Lead Manager.
//   1. Loguea con email + password.
//   2. Navega al listado filtrado (?desde=DD/MM/YYYY&hasta=DD/MM/YYYY&solo_recibidas=1).
//   3. Click "Exportar" → captura el download del .xlsx.
// Devuelve la ruta absoluta al archivo descargado.

import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';

const BASE = 'https://backoffice.yamahamotos.cl';
const NAV_TIMEOUT = 30_000;
const DOWNLOAD_TIMEOUT = 60_000;

// User-Agent realista — Chromium headless por defecto manda "HeadlessChrome"
// que algunos firewalls bloquean. Forzamos un UA de Chrome desktop.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

export async function downloadYamahaLeads({ user, pass, desde, hasta }) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
  });

  // Mini-stealth: oculta navigator.webdriver (bandera más usada por anti-bot).
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  try {
    // ── 1. Login ─────────────────────────────────────────────────
    console.log('[yamaha] login →', `${BASE}/login`);
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });

    // Selectores tolerantes — el form de Yamaha usa email/username/usuario y
    // contraseña como label/placeholder/name. Cualquier match sirve.
    await page.fill(
      'input[type="email"], input[name="email"], input[name="username"], input[name="usuario"]',
      user,
    );
    await page.fill(
      'input[type="password"], input[name="password"], input[name="contrasena"], input[name="contraseña"]',
      pass,
    );
    await page.click('button[type="submit"], button:has-text("Iniciar"), button:has-text("Ingresar")');

    // Espera redirección a /home (post-login).
    await page.waitForURL(/\/home/, { timeout: NAV_TIMEOUT }).catch(async () => {
      // Si el login falló, capturamos screenshot para debug.
      const errPath = path.join(os.tmpdir(), `yamaha-login-fail-${Date.now()}.png`);
      await page.screenshot({ path: errPath, fullPage: true }).catch(() => {});
      throw new Error(`Login a Yamaha falló. Screenshot: ${errPath}`);
    });
    console.log('[yamaha] login OK');

    // ── 2. Navegar al listado filtrado ──────────────────────────
    const listUrl = `${BASE}/cotizacion/modelo?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&solo_recibidas=1`;
    console.log('[yamaha] listado →', listUrl);
    await page.goto(listUrl, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });

    // ── 3. Click Exportar y capturar el download ────────────────
    console.log('[yamaha] click Exportar');
    const downloadPromise = page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT });
    await page.click('button:has-text("Exportar"), a:has-text("Exportar")');
    const download = await downloadPromise;

    const dest = path.join(os.tmpdir(), `yamaha-leads-${Date.now()}.xlsx`);
    await download.saveAs(dest);
    console.log('[yamaha] xlsx guardado en', dest);
    return dest;
  } finally {
    await context.close();
    await browser.close();
  }
}
