// Sesión Playwright contra Promobility Track Manager.
//   1. Loguea con email + password en /login.
//   2. Va a /manager/quotations.
//   3. Aplica filtro de fecha custom (desde-hasta), click "Aplicar Filtros".
//   4. Click botón "Excel" → captura el download del .xlsx.
// Devuelve la ruta absoluta al archivo descargado.

import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';

const BASE = 'https://track.promobility.cl';
const NAV_TIMEOUT = 30_000;
const DOWNLOAD_TIMEOUT = 60_000;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

// Promobility usa formato DD-MM-YY en los inputs DESDE/HASTA del filtro custom.
function toShortDate(ddmmyyyy) {
  // Recibe "DD/MM/YYYY" → devuelve "DD-MM-YY"
  const [d, m, y] = ddmmyyyy.split('/');
  return `${d}-${m}-${y.slice(2)}`;
}

export async function downloadPromobilityLeads({ user, pass, desde, hasta }) {
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

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  try {
    // ── 1. Login ─────────────────────────────────────────────────
    console.log('[promobility] login →', `${BASE}/login`);
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });

    await page.fill(
      'input[type="email"], input[name="email"], input[name="username"]',
      user,
    );
    await page.fill(
      'input[type="password"], input[name="password"]',
      pass,
    );
    await page.click('button[type="submit"], button:has-text("Iniciar"), button:has-text("Ingresar")');

    await page.waitForURL(/\/manager/, { timeout: NAV_TIMEOUT }).catch(async () => {
      const errPath = path.join(os.tmpdir(), `promobility-login-fail-${Date.now()}.png`);
      await page.screenshot({ path: errPath, fullPage: true }).catch(() => {});
      throw new Error(`Login a Promobility falló. Screenshot: ${errPath}`);
    });
    console.log('[promobility] login OK');

    // ── 2. Listado de oportunidades ─────────────────────────────
    console.log('[promobility] listado → /manager/quotations');
    await page.goto(`${BASE}/manager/quotations`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });

    // ── 3. Aplicar filtro de fecha custom (desde, hasta) ────────
    const desdeShort = toShortDate(desde);
    const hastaShort = toShortDate(hasta);
    console.log(`[promobility] filtro fecha: ${desdeShort} → ${hastaShort}`);

    // Abre el dropdown de fecha (texto contiene la fecha actual o "Filtros")
    // El dropdown se identifica por el botón con icono de calendario.
    await page.click('button:has(i.fa-calendar), button[id*="date"], button:has-text("Hoy"), button:has-text("Mes")').catch(() => {});

    // En el panel desplegado, click "Custom"
    await page.click('text=Custom').catch(() => {});

    // Llenamos los inputs DESDE y HASTA
    await page.fill('input[name="daterangepicker_start"], input[id*="desde" i]', desdeShort).catch(() => {});
    await page.fill('input[name="daterangepicker_end"], input[id*="hasta" i]', hastaShort).catch(() => {});

    // Click Aplicar (del rango de fecha)
    await page.click('button:has-text("Aplicar"):not(:has-text("Filtros"))').catch(() => {});
    await page.waitForTimeout(500);

    // Click "Aplicar Filtros" general (al lado de los selects de filtros)
    await page.click('button:has-text("Aplicar Filtros")');
    await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT }).catch(() => {});
    await page.waitForTimeout(800);

    // ── 4. Click "Excel" → captura el download ──────────────────
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
