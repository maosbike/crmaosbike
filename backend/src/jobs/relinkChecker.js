const logger = require('../config/logger');

// Cada 10 minutos re-corre el matcher sobre tickets con model_id NULL.
// El primer run va a los 30s del arranque (deja que la DB conecte).
// Idempotente: si no hay candidatos, cuesta 1 query y termina.
const RELINK_INTERVAL = parseInt(process.env.RELINK_INTERVAL || (10 * 60 * 1000));

let timer = null;

async function runOnce() {
  try {
    const importRoute = require('../routes/import');
    if (typeof importRoute.relinkUnresolvedLeads !== 'function') {
      logger.warn('[Relink Job] relinkUnresolvedLeads no exportado');
      return;
    }
    const r = await importRoute.relinkUnresolvedLeads(null);
    if (r.scanned > 0) {
      logger.info(`[Relink Job] scanned=${r.scanned} fixed=${r.fixed} stillUnresolved=${r.stillUnresolved}`);
      if (r.samples?.length) {
        logger.info(`[Relink Job] raws sin resolver (muestra): ${r.samples.slice(0, 5).join(' | ')}`);
      }
    }
  } catch (e) {
    logger.error(`[Relink Job] falló: ${e.message}`);
  }
}

module.exports = {
  start() {
    logger.info(`[Relink Job] Iniciado - cada ${RELINK_INTERVAL / 1000}s`);
    setTimeout(runOnce, 30_000);
    timer = setInterval(runOnce, RELINK_INTERVAL);
  },
  stop() {
    if (timer) { clearInterval(timer); timer = null; logger.info('[Relink Job] Detenido'); }
  },
  runOnce,
};
