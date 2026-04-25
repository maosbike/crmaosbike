// Sesión Playwright contra Promobility Track Manager.
//   1. Loguea con email + password en /login.
//   2. Resuelve el Cloudflare Turnstile (checkbox que valida solo si pasás
//      las heurísticas anti-bot — necesita stealth fuerte).
//   3. Va directo a /manager/quotations?from=DD-MM-YY&to=DD-MM-YY (la URL
//      lleva los filtros como query params — no hace falta interactuar con
//      el date picker).
//   4. Click botón "Excel" → captura el download.

import { chromium as basePlaywrightChromium } from 'playwright';
import { chromium as extraChromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'node:path';
import os from 'node:os';

// Stealth plugin oficial — oculta ~30 banderas de automation que Cloudflare
// Turnstile inspecciona. Mucho más efectivo que el stealth manual.
const stealth = StealthPlugin();
extraChromium.use(stealth);
const chromium = extraChromium;

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

// Resuelve el Cloudflare Turnstile.
// Estrategia:
//   1. Esperar a que el iframe del widget cargue.
//   2. Esperar a que Turnstile valide pasivamente (con stealth fuerte
//      a veces auto-aprueba sin necesidad de click).
//   3. Si tras X segundos no se validó, intentar click manual al checkbox.
//   4. Esperar el token cf-turnstile-response.
async function solveTurnstile(page) {
  console.log('[promobility] esperando widget Turnstile…');

  // Espera a que el iframe del widget esté en el DOM.
  await page.waitForSelector('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]', {
    timeout: 15_000,
  }).catch(() => {
    console.log('[promobility] no se detectó iframe Turnstile (puede ser invisible)');
  });

  // Damos hasta CAPTCHA_TIMEOUT para que el token se setee.
  // Si stealth funciona, Turnstile valida automático en 1-5 seg sin click.
  console.log('[promobility] esperando validación pasiva…');
  let validated = false;
  try {
    await page.waitForFunction(
      () => {
        const tokenInput = document.querySelector(
          'input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"]',
        );
        return tokenInput && tokenInput.value && tokenInput.value.length > 10;
      },
      { timeout: 8_000 },
    );
    validated = true;
    console.log('[promobility] Turnstile validado pasivamente ✓');
  } catch {
    // Pasiva no funcionó — intentamos click manual al checkbox.
    console.log('[promobility] pasiva no, intentando click manual al checkbox…');
  }

  if (!validated) {
    // Intentar todos los iframes que puedan ser del widget.
    const frames = page.frames();
    for (const f of frames) {
      const url = f.url();
      if (!url.includes('challenges.cloudflare.com') && !url.includes('turnstile')) continue;
      try {
        const checkbox = f.locator('input[type="checkbox"]');
        await checkbox.waitFor({ state: 'visible', timeout: 5_000 });
        await checkbox.click({ force: true });
        console.log('[promobility] click checkbox aplicado');
        break;
      } catch {
        // probar siguiente frame
      }
    }

    // Esperar token tras el click.
    await page.waitForFunction(
      () => {
        const tokenInput = document.querySelector(
          'input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"]',
        );
        return tokenInput && tokenInput.value && tokenInput.value.length > 10;
      },
      { timeout: CAPTCHA_TIMEOUT },
    ).catch(() => {
      throw new Error(
        'Cloudflare Turnstile no validó. Probable detección anti-bot persistente. ' +
        'Opciones: subir stealth aún más o integrar 2Captcha.',
      );
    });
    console.log('[promobility] Turnstile validado tras click ✓');
  }
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
