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
  // side === 'emitida' o 'recibida'
  logger.info(`[${side}] abriendo historial DTE`);
  await sii.openHistorialDte();

  // El menú dentro del historial tiene dos botones:
  //   "Ver Documentos Emitidos"   → emitidas
  //   "Ver Documentos Recibidos"  → recibidas
  const targetName = side === 'emitida' ? /documentos\s+emitidos/i : /documentos\s+recibidos/i;
  const btn = sii.page.getByRole('link', { name: targetName })
    .or(sii.page.getByRole('button', { name: targetName }));
  await btn.first().click();
  await sii.page.waitForLoadState('domcontentloaded', { timeout: 30_000 });

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

  const summary = { emitida: null, recibida: null };
  const t0 = Date.now();
  try {
    await sii.start();
    await sii.login();

    for (const side of ['emitida', 'recibida']) {
      try {
        summary[side] = await processSide(sii, side);
      } catch (e) {
        logger.error(`[${side}] corrida falló: ${e.message}`);
        summary[side] = { error: e.message };
      }
      // Volver al menú principal antes de cambiar de lado.
      try {
        await sii.page.goBack({ timeout: 15_000 });
        await sii.page.goBack({ timeout: 15_000 });
      } catch (_) {}
    }
  } finally {
    await sii.stop();
  }

  const elapsed = Math.round((Date.now() - t0) / 1000);
  logger.info(`Corrida completa en ${elapsed}s — emitida: ${JSON.stringify(summary.emitida)} · recibida: ${JSON.stringify(summary.recibida)}`);
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
