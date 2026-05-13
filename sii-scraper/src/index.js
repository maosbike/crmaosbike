/**
 * index.js — orquestador del sii-scraper.
 *
 * Modos:
 *   RUN_ONCE=1     → corre una sola vez y termina (útil para test/CI).
 *   BACKFILL=1     → primera corrida masiva: itera 12 meses del TARGET_YEAR.
 *   sin flags      → loop con cron cada CRON_HOURS (default 3 hs). Cada
 *                    corrida solo procesa el mes actual (+ anterior si
 *                    INCLUDE_PREV_YEAR=1).
 *
 * Flujo por corrida:
 *   1. Login al SII.
 *   2. Para cada lado (emitidas, recibidas):
 *      a. Abrir historial DTE.
 *      b. Listar filas visibles.
 *      c. Pedir al CRM qué folios YA tiene (dedupe rápido).
 *      d. Descargar los que faltan.
 *      e. Subir cada PDF al endpoint /ingest/invoice del CRM.
 *   3. Cerrar browser.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { SiiClient } = require('./siiClient');
const { getExistingFolios, uploadInvoice } = require('./crmClient');

// Logger minimalista con timestamp y nivel.
const logger = {
  info: (...a) => console.log(new Date().toISOString(), '[info]', ...a),
  warn: (...a) => console.warn(new Date().toISOString(), '[warn]', ...a),
  error: (...a) => console.error(new Date().toISOString(), '[error]', ...a),
};

const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || '/tmp/sii-pdfs';
const CRON_HOURS = parseInt(process.env.CRON_HOURS || '3', 10);
const RUN_ONCE = String(process.env.RUN_ONCE || '').toLowerCase() === '1';
const FORCE_FULL = String(process.env.FORCE_FULL || '').toLowerCase() === '1';

async function processSide(sii, side) {
  // side === 'emitida' (recibida queda fuera de scope en esta primera fase).
  logger.info(`[${side}] abriendo historial DTE`);
  await sii.openHistorialDte();

  // Después del click "Historial de DTE..." aterrizamos en una página que
  // típicamente tiene dos botones/links: "Ver Documentos Emitidos" y
  // "Ver Documentos Recibidos". Dumpeo el body y los links visibles para
  // ver con qué nos encontramos antes de clickear.
  const beforeBody = await sii.page.evaluate(() => (document.body?.innerText || '').slice(0, 500)).catch(() => '');
  logger.info(`[${side}] pantalla post-click historial — body head: ${beforeBody.replace(/\s+/g, ' ')}`);

  const targetName = side === 'emitida' ? /documentos\s+emitidos/i : /documentos\s+recibidos/i;
  const candidates = [
    sii.page.getByRole('link', { name: targetName }),
    sii.page.getByRole('button', { name: targetName }),
    sii.page.locator(`a:has-text("Documentos Emitidos")`),
    sii.page.locator(`input[type="submit"][value*="Emitidos" i], button:has-text("Emitidos")`),
  ];
  let clicked = false;
  for (const cand of candidates) {
    const loc = cand.first();
    if (await loc.isVisible().catch(() => false)) {
      const t = await loc.innerText().catch(() => '');
      logger.info(`[${side}] click en: ${t || '(sin texto)'}`);
      // El click puede abrir popup/nueva pestaña — preparamos el listener.
      const [popup] = await Promise.all([
        sii.context.waitForEvent('page', { timeout: 5_000 }).catch(() => null),
        loc.click(),
      ]);
      if (popup) {
        await popup.waitForLoadState('domcontentloaded', { timeout: 30_000 });
        sii.page = popup; // El resto del flujo usa la nueva pestaña
        logger.info(`[${side}] click abrió popup — cambio a la nueva pestaña`);
      }
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    const links = await sii.page.$$eval('a, button, input[type="submit"]', els =>
      els.slice(0, 40).map(e => {
        const txt = (e.innerText || e.value || '').trim().slice(0, 80);
        const href = e.getAttribute('href') || e.getAttribute('onclick') || '';
        return `${txt} → ${href}`;
      }).filter(s => s.trim() !== '→ ')
    ).catch(() => []);
    logger.warn(`[${side}] No se encontró "Ver Documentos Emitidos". Links/botones disponibles:`);
    links.forEach((l, i) => logger.warn(`  [${i}] ${l}`));
    throw new Error('Botón "Ver Documentos Emitidos" no encontrado en la página');
  }
  await sii.page.waitForLoadState('domcontentloaded', { timeout: 30_000 });

  // Después del click, el SII suele llevar a un FORMULARIO de filtros
  // (rango de fechas, tipo de documento) antes de mostrar la tabla.
  // Dumpeamos lo que hay para entender la estructura.
  const formInfo = await sii.page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, select')).slice(0, 30).map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || '',
      name: el.getAttribute('name') || '',
      id: el.getAttribute('id') || '',
      value: el.value || '',
    }));
    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]')).slice(0, 20).map(el => ({
      type: el.getAttribute('type') || '',
      value: el.value || '',
      text: (el.innerText || '').trim().slice(0, 60),
    }));
    const tables = document.querySelectorAll('table').length;
    const iframes = Array.from(document.querySelectorAll('iframe')).map(f => f.getAttribute('src') || '(sin src)');
    return { url: location.href, title: document.title, bodyHead: (document.body?.innerText || '').slice(0, 600), inputs, buttons, tables, iframes };
  }).catch(() => null);

  if (formInfo) {
    logger.info(`[${side}] página post-click — url=${formInfo.url} title=${JSON.stringify(formInfo.title)} tables=${formInfo.tables} iframes=${JSON.stringify(formInfo.iframes)}`);
    logger.info(`[${side}] body head: ${formInfo.bodyHead.replace(/\s+/g, ' ')}`);
    logger.info(`[${side}] inputs/selects: ${JSON.stringify(formInfo.inputs)}`);
    logger.info(`[${side}] botones: ${JSON.stringify(formInfo.buttons)}`);
  }

  // Manejo de re-autenticación + selección de empresa.
  // Después de "Ver Documentos Emitidos" el SII suele:
  //   1) Pedir login otra vez (página "Autenticación" en zeusr/AUT2000).
  //   2) Mostrar mipeSelEmpresa.cgi para que elijas para qué RUT operás.
  //   3) Recién después aparece la tabla.
  const url1 = sii.page.url();
  const title1 = await sii.page.title().catch(() => '');
  const needsReauth = /AUT2000|IngresoRutClave|Autenticaci/i.test(url1 + ' ' + title1);
  if (needsReauth) {
    logger.info(`[${side}] re-autenticación requerida en ${url1}`);
    const rutInput = sii.page.locator('input[name="rutcntr"]:visible').first();
    if (await rutInput.isVisible().catch(() => false)) {
      await rutInput.fill(process.env.SII_RUT);
      const passInput = sii.page.locator('input[name="clave"]:visible, input[type="password"]:visible').first();
      await passInput.fill(process.env.SII_PASSWORD);
      const submit = sii.page.locator('input[type="submit"], button:has-text("Ingresar"), button:has-text("INGRESAR")').first();
      await submit.click();
      try {
        await sii.page.waitForURL(url => !/CAutInicio\.cgi/i.test(url.toString()), {
          timeout: 15_000,
          waitUntil: 'domcontentloaded',
        });
      } catch (_) {
        await new Promise(r => setTimeout(r, 3000));
      }
      await sii.page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});

      // Si quedamos en CAutInicio.cgi (la transición no auto-redirigió),
      // navegamos directo a la URL objetivo. La cookie de sesión ya quedó
      // seteada en el re-login, así que la navegación directa funciona.
      if (/CAutInicio\.cgi/i.test(sii.page.url())) {
        const TARGET = 'https://www1.sii.cl/cgi-bin/Portal001/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION=2&TIPO=4';
        logger.info(`[${side}] post re-login quedamos en transición — navegando directo a ${TARGET}`);
        await sii.page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      }
      logger.info(`[${side}] re-login completo, url final: ${sii.page.url()} title: ${await sii.page.title().catch(() => '')}`);
    } else {
      logger.warn(`[${side}] página de re-auth sin input rutcntr — selectores cambiaron`);
    }
  }

  // Selección de empresa: si el RUT del login puede operar para varias
  // empresas, el SII muestra mipeSelEmpresa.cgi. Buscamos el RUT objetivo
  // (SII_EMPRESA_RUT) y lo clickeamos.
  if (/mipeSelEmpresa|selEmpresa|seleccion.*empresa/i.test(sii.page.url() + ' ' + (await sii.page.title().catch(() => '')))) {
    const empresaRut = (process.env.SII_EMPRESA_RUT || '').replace(/\./g, '').replace(/-/g, '').trim();
    logger.info(`[${side}] pantalla seleccionar empresa — buscando RUT ${process.env.SII_EMPRESA_RUT}`);
    // El RUT puede aparecer formateado (76.405.840-2) o sin formato. Probamos varias variantes.
    const variants = [
      process.env.SII_EMPRESA_RUT,
      empresaRut,
      empresaRut.replace(/(\d)(\d)$/, '$1-$2'),
      empresaRut.replace(/(\d{2})(\d{3})(\d{3})(\d)/, '$1.$2.$3-$4'),
    ].filter(Boolean);
    let picked = false;
    for (const v of variants) {
      const loc = sii.page.locator(`a:has-text("${v}"), button:has-text("${v}"), tr:has-text("${v}")`).first();
      if (await loc.isVisible().catch(() => false)) {
        logger.info(`[${side}] click en empresa: ${v}`);
        await loc.click();
        picked = true;
        break;
      }
    }
    if (!picked) {
      // Dump opciones disponibles si no matcheó
      const empresas = await sii.page.$$eval('a, tr', els =>
        els.slice(0, 30).map(e => e.innerText.trim().slice(0, 100)).filter(Boolean)
      ).catch(() => []);
      logger.warn(`[${side}] no encontré empresa ${process.env.SII_EMPRESA_RUT}. Opciones visibles:`);
      empresas.forEach((e, i) => logger.warn(`  [${i}] ${e}`));
      throw new Error(`Empresa ${process.env.SII_EMPRESA_RUT} no encontrada en la pantalla de selección`);
    }
    await sii.page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
  }

  const rows = await sii.listAllRows();
  if (rows.length === 0) {
    logger.warn(`[${side}] sin filas en la tabla — revisar selectores`);
    return { downloaded: 0, uploaded: 0, skipped: 0, errors: 0 };
  }

  // Dedupe: preguntar al CRM qué folios ya tiene.
  const folios = rows.map(r => r.folio);
  let alreadyHave = new Set();
  if (!FORCE_FULL) {
    try {
      alreadyHave = await getExistingFolios(side, folios);
      logger.info(`[${side}] CRM ya tiene ${alreadyHave.size} de ${folios.length} folios`);
    } catch (e) {
      logger.warn(`[${side}] check al CRM falló: ${e.message}. Procedo sin dedupe.`);
    }
  }

  const stats = { downloaded: 0, uploaded: 0, skipped: alreadyHave.size, errors: 0 };

  for (const row of rows) {
    if (alreadyHave.has(row.folio)) continue;
    try {
      const pdfPath = await sii.downloadByFolio(row.folio);
      if (!pdfPath || !fs.existsSync(pdfPath)) {
        logger.warn(`[${side}] folio ${row.folio}: PDF no descargado`);
        stats.errors++;
        continue;
      }
      stats.downloaded++;

      const r = await uploadInvoice(pdfPath, side, row.folio);
      logger.info(`[${side}] folio ${row.folio}: ${r.status}${r.invoice_id ? ` (id=${r.invoice_id})` : ''}`);
      if (r.status === 'skipped') stats.skipped++;
      else stats.uploaded++;

      // Borrar el PDF local para no llenar el disco.
      fs.unlinkSync(pdfPath);
    } catch (e) {
      logger.error(`[${side}] folio ${row.folio}: ${e.message}`);
      stats.errors++;
    }
  }

  return stats;
}

async function runOnce() {
  const sii = new SiiClient({
    rut: process.env.SII_RUT,
    password: process.env.SII_PASSWORD,
    empresaRut: process.env.SII_EMPRESA_RUT,
    downloadDir: DOWNLOAD_DIR,
    logger,
  });

  // Scope actual: SOLO emitidas. Recibidas se hará en otro scraper separado.
  const summary = { emitida: null };
  const t0 = Date.now();
  try {
    await sii.start();
    await sii.login();

    try {
      summary.emitida = await processSide(sii, 'emitida');
    } catch (e) {
      logger.error(`[emitida] corrida falló: ${e.message}`);
      summary.emitida = { error: e.message };
    }
  } finally {
    await sii.stop();
  }

  const elapsed = Math.round((Date.now() - t0) / 1000);
  logger.info(`Corrida completa en ${elapsed}s — emitida: ${JSON.stringify(summary.emitida)}`);
  return summary;
}

async function main() {
  logger.info(`sii-scraper arrancando. RUN_ONCE=${RUN_ONCE}, FORCE_FULL=${FORCE_FULL}, CRON_HOURS=${CRON_HOURS}`);

  // Validación de env vars críticas antes de pegarle al SII.
  for (const k of ['SII_RUT', 'SII_PASSWORD', 'CRM_BASE_URL', 'CRM_INTERNAL_TOKEN']) {
    if (!process.env[k]) {
      logger.error(`FATAL: falta env var ${k}`);
      process.exit(1);
    }
  }

  // Una corrida inmediata.
  await runOnce().catch(e => logger.error('Corrida inicial falló:', e.message));

  if (RUN_ONCE) {
    logger.info('RUN_ONCE=1 → cerrando');
    return;
  }

  // Cron interno: setInterval simple cada CRON_HOURS. No usamos node-cron
  // para evitar otra dep — la precisión al minuto no nos importa.
  const ms = CRON_HOURS * 60 * 60 * 1000;
  logger.info(`Cron interno: próxima corrida en ${CRON_HOURS} hs`);
  setInterval(() => {
    runOnce().catch(e => logger.error('Corrida cron falló:', e.message));
  }, ms);

  // Mantener el proceso vivo.
  process.stdin.resume();
}

main().catch(e => {
  logger.error('main() crasheó:', e);
  process.exit(1);
});
