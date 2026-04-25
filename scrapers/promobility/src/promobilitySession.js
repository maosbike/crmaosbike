// Sesión Playwright contra Promobility Track Manager.
//   1. Loguea con email + password en /login.
//   2. Resuelve el Cloudflare Turnstile (checkbox que valida solo si pasás
//      las heurísticas anti-bot — necesita stealth fuerte).
//   3. Va directo a /manager/quotations?from=DD-MM-YY&to=DD-MM-YY (la URL
//      lleva los filtros como query params — no hace falta interactuar con
//      el date picker).
//   4. Click botón "Excel" → captura el download.

import { chromium as extraChromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import path from 'node:path';
import os from 'node:os';

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

// Cliente directo a la API de 2Captcha (sin wrapper npm — los wrappers v3
// tienen bugs intermitentes con Turnstile). Usa el endpoint legacy in.php /
// res.php que es estable y bien documentado.
async function solve2Captcha({ apiKey, sitekey, pageurl, action, cdata }) {
  const params = {
    key: apiKey,
    method: 'turnstile',
    sitekey,
    pageurl,
    json: 1,
  };
  // Algunos sitios pasan data-action / data-cdata al widget. Si están,
  // 2Captcha los necesita para que el token sea aceptado por el server.
  if (action) params.action = action;
  if (cdata) params.data = cdata;

  // 1. Submit task.
  const submit = await axios.get('https://2captcha.com/in.php', { params, timeout: 30_000 });
  if (submit.data.status !== 1) {
    throw new Error(`2Captcha rechazó submit: ${submit.data.request} ${submit.data.error_text || ''}`);
  }
  const taskId = submit.data.request;
  console.log(`[promobility] 2Captcha task=${taskId}, esperando solve…`);

  // 2. Poll.
  const POLL_INTERVAL = 5_000;
  const MAX_WAIT = 180_000; // 3 min
  const startPoll = Date.now();
  while (Date.now() - startPoll < MAX_WAIT) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    const poll = await axios.get('https://2captcha.com/res.php', {
      params: { key: apiKey, action: 'get', id: taskId, json: 1 },
      timeout: 15_000,
    });
    if (poll.data.status === 1) {
      return poll.data.request; // el token
    }
    if (poll.data.request !== 'CAPCHA_NOT_READY') {
      throw new Error(`2Captcha error: ${poll.data.request}`);
    }
  }
  throw new Error('2Captcha timeout (>3min sin solve).');
}

async function solveTurnstileWith2Captcha(page, apiKey) {
  console.log('[promobility] localizando widget Turnstile…');

  await page.waitForSelector(
    '.cf-turnstile, [data-sitekey], iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]',
    { timeout: 15_000 },
  );

  // Extraer sitekey + posibles params extra que 2Captcha necesita.
  const widgetData = await page.evaluate(() => {
    const widget = document.querySelector('.cf-turnstile, [data-sitekey]');
    if (widget) {
      return {
        sitekey: widget.getAttribute('data-sitekey'),
        action: widget.getAttribute('data-action') || null,
        cdata: widget.getAttribute('data-cdata') || null,
      };
    }
    const iframe = document.querySelector(
      'iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]',
    );
    if (iframe) {
      const m = iframe.src.match(/[?&]k=([^&]+)/);
      if (m) return { sitekey: decodeURIComponent(m[1]), action: null, cdata: null };
    }
    return { sitekey: null, action: null, cdata: null };
  });

  if (!widgetData.sitekey) throw new Error('No se pudo extraer el sitekey de Turnstile.');
  console.log(
    `[promobility] sitekey=${widgetData.sitekey} action=${widgetData.action || '(none)'} cdata=${widgetData.cdata ? '(present)' : '(none)'}`,
  );

  console.log('[promobility] solicitando solve a 2Captcha (5-30s)…');
  const startSolve = Date.now();
  const token = await solve2Captcha({
    apiKey,
    sitekey: widgetData.sitekey,
    pageurl: page.url(),
    action: widgetData.action,
    cdata: widgetData.cdata,
  });
  const dur = ((Date.now() - startSolve) / 1000).toFixed(1);
  console.log(`[promobility] 2Captcha resolvió en ${dur}s, token recibido (${token.length} chars)`);

  // Inyectar token y disparar callback si existe.
  await page.evaluate((tok) => {
    let input = document.querySelector(
      'input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"]',
    );
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'cf-turnstile-response';
      const form = document.querySelector('form');
      (form || document.body).appendChild(input);
    }
    input.value = tok;

    const widget = document.querySelector('.cf-turnstile, [data-sitekey]');
    if (widget) {
      const cbName = widget.getAttribute('data-callback');
      if (cbName && typeof window[cbName] === 'function') {
        try {
          window[cbName](tok);
        } catch (_e) { /* ignorar */ }
      }
    }
  }, token);
  console.log('[promobility] token inyectado en formulario ✓');
}

export async function downloadPromobilityLeads({ user, pass, desde, hasta, twoCaptchaKey }) {
  if (!twoCaptchaKey) {
    throw new Error('Falta TWOCAPTCHA_KEY. Conseguila en https://2captcha.com.');
  }
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
    await solveTurnstileWith2Captcha(page, twoCaptchaKey);

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
