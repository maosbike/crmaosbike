const SLAService = require('../services/slaService');

const SLA_INTERVAL = parseInt(process.env.SLA_CHECK_INTERVAL || '300000'); // 5 min default

let timer = null;

module.exports = {
  start() {
    console.log(`[SLA Job] Iniciado - cada ${SLA_INTERVAL / 1000}s`);

    // Primer chequeo después de 30 segundos (dar tiempo a que la BD esté lista)
    setTimeout(() => {
      SLAService.checkAll().catch(e => console.error('[SLA Job] Error:', e));
    }, 30000);

    // Chequeos periódicos
    timer = setInterval(() => {
      SLAService.checkAll().catch(e => console.error('[SLA Job] Error:', e));
    }, SLA_INTERVAL);
  },

  stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
      console.log('[SLA Job] Detenido');
    }
  }
};
