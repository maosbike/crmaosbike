// Sesión Playwright contra Promobility Track Manager.
//   1. Loguea con email + password en /login.
//   2. Resuelve el Cloudflare Turnstile (checkbox que valida solo si pasás
//      las heurísticas anti-bot — necesita stealth fuerte).
//   3. Va directo a /manager/quotations?from=DD-MM-YY&to=DD-MM-YY (la URL
//      lleva los filtros como query params — no hace falta interactuar con
//      el date picker).
//   4. Click botón "Excel" → captura el download.

import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';

const BASE = 'https://track.promobility.cl';
const NAV_TIMEOUT = 30_000;
const DOWNLOAD_TIMEOUT = 60_000;
const CAPTCHA_TIMEOUT = 30_000;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

// Promobility usa formato DD-MM-YY en la URL (?from=24-04-26&to=25-04-26).
function toShortDate(ddmmyyyy) {
  const [d, m, y] = ddmmyyyy.split('/');
  return `${d}-${m}-${y.slice(2)}`;
}

// Stealth completo — oculta las banderas más usadas por anti-bot. Cloudflare
// Turnstile inspecciona varias de estas para decidir si auto-aprueba.
async function applyStealth(context) {
  await context.addInitScript(() => {
    // navigator.webdriver = false
    Object.defineProperty(navigator, 'webdriver', { get: () => false });

    // languages plausible
    Object.defineProperty(navigator, 'languages', {
      get: () => ['es-CL', 'es', 'en-US', 'en'],
    });

    // plugins no vacíos (un browser real tiene varios)
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin' },
        { name: 'Chrome PDF Viewer' },
        { name: 'Native Client' },
      ],
    });

    // chrome runtime existe
    if (!window.chrome) {
      // eslint-disable-next-line no-undef
      window.chrome = { runtime: {} };
    }

    // permissions API responde como navegador real
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = (params) =>
        params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(params);
    }
  });
}

// Resuelve el Cloudflare Turnstile (checkbox).
// La idea: el iframe del widget tiene un checkbox que cuando se clickea,
// dispara la verificación passiva. Si pasamos las heurísticas (stealth bien),
// se valida solo en 1-3 segundos.
async function solveTurnstile(page) {
  console.log('[promobility] esperando widget Turnstile…');

  // Buscar el iframe del Turnstile (URL contiene challenges.cloudflare.com).
  const turnstileFrame = page.frameLocator('iframe[src*="challenges.cloudflare.com"]').first();

  // Esperar a que el checkbox aparezca dentro del iframe.
  const checkbox = turnstileFrame.locator('input[type="checkbox"]');
  try {
    await checkbox.waitFor({ state: 'visible', timeout: 10_000 });
  } catch {
    // Si no aparece checkbox visible, capaz Turnstile validó automático en background.
    console.log('[promobility] no se encontró checkbox visible — Turnstile pudo haber pasado solo');
    return;
  }

  console.log('[promobility] click checkbox Turnstile');
  await checkbox.click({ force: true });

  // Esperar a que el token se setee — Turnstile crea un input oculto
  // <input name="cf-turnstile-response"> con el token cuando pasa.
  console.log('[promobility] esperando validación…');
  await page.waitForFunction(
    () => {
      const tokenInput = document.querySelector('input[name="cf-turnstile-response"]');
      return tokenInput && tokenInput.value && tokenInput.value.length > 10;
    },
    { timeout: CAPTCHA_TIMEOUT },
  ).catch(() => {
    throw new Error('Cloudflare Turnstile no validó dentro del timeout. Probable detección anti-bot.');
  });
  console.log('[promobility] Turnstile validado ✓');
}

export async function downloadPromobilityLeads({ user, pass, desde, hasta }) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
  });

  await applyStealth(context);

  const page = await context.newPage();

  try {
    // ── 1. Login + Turnstile ─────────────────────────────────────
    console.log('[promobility] login →', `${BASE}/login`);
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });

    await page.fill('input[type="email"], input[name="email"]', user);
    await page.fill('input[type="password"], input[name="password"]', pass);

    // Resolvé el captcha ANTES de submit.
    await solveTurnstile(page);

    // Submit login.
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Iniciar")');

    await page.waitForURL(/\/manager/, { timeout: NAV_TIMEOUT }).catch(async () => {
      const errPath = path.join(os.tmpdir(), `promobility-login-fail-${Date.now()}.png`);
      await page.screenshot({ path: errPath, fullPage: true }).catch(() => {});
      throw new Error(`Login a Promobility falló post-Turnstile. Screenshot: ${errPath}`);
    });
    console.log('[promobility] login OK');

    // ── 2. Listado con filtros como query params ────────────────
    // Promobility expone los filtros en la URL → no hace falta tocar el date picker.
    const desdeShort = toShortDate(desde);
    const hastaShort = toShortDate(hasta);
    const url = `${BASE}/manager/quotations?from=${desdeShort}&to=${hastaShort}&branch=undefined&seller=&modelo=&fin=`;
    console.log('[promobility] listado →', url);
    await page.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    await page.waitForTimeout(800);

    // ── 3. Click Excel → captura download ───────────────────────
    console.log('[promobility] click Excel');
    const downloadPromise = page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT });
    await page.click('button:has-text("Excel"), a:has-text("Excel")');
    const download = await downloadPromise;

    const dest = path.join(os.tmpdir(), `promobility-leads-${Date.now()}.xlsx`);
    await download.saveAs(dest);
    console.log('[promobility] xlsx guardado en', dest);
    return dest;
  } finally {
    await context.close();
    await browser.close();
  }
}
