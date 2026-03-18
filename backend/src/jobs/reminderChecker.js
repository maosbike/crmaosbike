const ReminderService = require('../services/reminderService');

const REMINDER_INTERVAL = parseInt(process.env.REMINDER_CHECK_INTERVAL || '900000'); // 15 min default

let timer = null;
let cleanupTimer = null;

module.exports = {
  start() {
    console.log(`[Reminder Job] Iniciado - cada ${REMINDER_INTERVAL / 1000}s`);

    // Primer chequeo después de 45 segundos
    setTimeout(() => {
      ReminderService.checkAll().catch(e => console.error('[Reminder Job] Error:', e));
    }, 45000);

    // Chequeos periódicos
    timer = setInterval(() => {
      ReminderService.checkAll().catch(e => console.error('[Reminder Job] Error:', e));
    }, REMINDER_INTERVAL);

    // Limpieza de notificaciones viejas cada 24h
    cleanupTimer = setInterval(() => {
      ReminderService.cleanOldNotifications().catch(e => console.error('[Cleanup] Error:', e));
    }, 86400000);
  },

  stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (cleanupTimer) { clearInterval(cleanupTimer); cleanupTimer = null; }
    console.log('[Reminder Job] Detenido');
  }
};
