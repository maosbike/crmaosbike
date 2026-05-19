/**
 * siiSync.js — cron job que sincroniza el RCV del SII cada N horas.
 *
 * Config:
 *   SII_SYNC_ENABLED   — 'false' para apagarlo (default: encendido).
 *   SII_SYNC_INTERVAL  — ms entre corridas. Default 3h.
 *   SII_SYNC_MONTHS_BACK — meses hacia atrás incluidos en cada corrida.
 *                          Default 1 (actual + previo, porque facturas de
 *                          proveedores pueden llegar con delay).
 *   SII_CERT_PFX_B64   — si no está, el job no arranca (NO-OP).
 *
 * Primer chequeo después de 60s del arranque, para que la app termine de subir.
 */
const logger = require('../config/logger');
const { syncRecentMonths } = require('../services/sii/sync');

const INTERVAL_MS = parseInt(process.env.SII_SYNC_INTERVAL || (3 * 60 * 60 * 1000), 10); // 3h default
const MONTHS_BACK = parseInt(process.env.SII_SYNC_MONTHS_BACK || '1', 10);
const ENABLED = process.env.SII_SYNC_ENABLED !== 'false';

let timer = null;
let running = false;

async function runOnce() {
  if (running) {
    logger.warn('[SII Sync] corrida previa todavía en curso, salteo este tick');
    return;
  }
  running = true;
  const startedAt = Date.now();
  try {
    const summary = await syncRecentMonths(MONTHS_BACK);
    logger.info({
      durationMs: Date.now() - startedAt,
      totals: summary.totals,
      runs: summary.runs.map(r => ({ y: r.year, m: r.month, src: r.source, ins: r.inserted, upd: r.updated, err: r.errors.length })),
    }, '[SII Sync] corrida completa');
  } catch (e) {
    logger.error({ err: e.message, stack: e.stack }, '[SII Sync] corrida falló');
  } finally {
    running = false;
  }
}

module.exports = {
  start() {
    if (!ENABLED) {
      logger.info('[SII Sync] DESHABILITADO via SII_SYNC_ENABLED=false');
      return;
    }
    if (!process.env.SII_CERT_PFX_B64 || !process.env.SII_CERT_PASSWORD || !process.env.SII_EMPRESA_RUT) {
      logger.info('[SII Sync] no arranca — SII_CERT_PFX_B64 / SII_CERT_PASSWORD / SII_EMPRESA_RUT no configuradas');
      return;
    }
    logger.info(`[SII Sync] iniciado — cada ${INTERVAL_MS / 1000}s, ${MONTHS_BACK} mes(es) atrás`);
    setTimeout(() => { runOnce().catch(() => {}); }, 60_000);
    timer = setInterval(() => { runOnce().catch(() => {}); }, INTERVAL_MS);
  },

  stop() {
    if (timer) { clearInterval(timer); timer = null; }
    logger.info('[SII Sync] detenido');
  },

  // Exportamos runOnce para testing manual.
  runOnce,
};
