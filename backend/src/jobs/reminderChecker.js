const logger = require("../config/logger");
const ReminderService = require('../services/reminderService');

const REMINDER_INTERVAL = parseInt(process.env.REMINDER_CHECK_INTERVAL || '900000'); // 15 min default

let timer = null;
let cleanupTimer = null;

module.exports = {
  start() {
    logger.info(`[Reminder Job] Iniciado - cada ${REMINDER_INTERVAL / 1000}s`);

    // Primer chequeo después de 45 segundos
    setTimeout(() => {
      ReminderService.checkAll().catch(e => logger.error('[Reminder Job] Error:', e));
    }, 45000);

    // Chequeos periódicos
    timer = setInterval(() => {
      ReminderService.checkAll().catch(e => logger.error('[Reminder Job] Error:', e));
    }, REMINDER_INTERVAL);

    // Limpieza de notificaciones viejas cada 24h
    cleanupTimer = setInterval(() => {
      ReminderService.cleanOldNotifications().catch(e => logger.error('[Cleanup] Error:', e));
    }, 86400000);
  },

  stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (cleanupTimer) { clearInterval(cleanupTimer); cleanupTimer = null; }
    logger.info('[Reminder Job] Detenido');
  }
};
