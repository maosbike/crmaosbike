const db = require('../config/db');
const NotificationService = require('./notificationService');

const ReminderService = {
  // Obtener admins para notificaciones
  async getAdminIds() {
    const { rows } = await db.query(
      `SELECT id FROM users
       WHERE role IN ('super_admin', 'admin_comercial')
       AND active = true`
    );
    return rows.map(r => r.id);
  },

  // Chequeo de recordatorios (llamado por cron)
  async checkAll() {
    const now = new Date();
    console.log(`[Reminders] Iniciando chequeo - ${now.toISOString()}`);

    // 1. Recordatorios PRÓXIMOS (dentro de 1 hora)
    const { rows: upcoming } = await db.query(
      `SELECT r.*, r.id as reminder_id
       FROM reminders r
       WHERE r.status = 'pending'
         AND r.due_date = CURRENT_DATE
         AND r.due_time IS NOT NULL
         AND r.due_time <= (CURRENT_TIME + INTERVAL '1 hour')
         AND r.due_time > CURRENT_TIME
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.link_type = 'reminder' AND n.link_id = r.id AND n.type = 'reminder_due'
           AND n.created_at > NOW() - INTERVAL '2 hours'
         )`
    );

    for (const rem of upcoming) {
      await NotificationService.reminderDue(rem);
      console.log(`[Reminders] Notificación: "${rem.title}" próximo`);
    }

    // 2. Recordatorios de hoy sin hora que no se han notificado
    const { rows: todayNoTime } = await db.query(
      `SELECT r.*
       FROM reminders r
       WHERE r.status = 'pending'
         AND r.due_date = CURRENT_DATE
         AND r.due_time IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.link_type = 'reminder' AND n.link_id = r.id AND n.type = 'reminder_due'
           AND n.created_at > NOW() - INTERVAL '12 hours'
         )`
    );

    for (const rem of todayNoTime) {
      await NotificationService.reminderDue(rem);
      console.log(`[Reminders] Notificación: "${rem.title}" es para hoy`);
    }

    // 3. Recordatorios VENCIDOS (fecha pasada, todavía pending)
    const { rows: overdue } = await db.query(
      `SELECT r.*
       FROM reminders r
       WHERE r.status = 'pending'
         AND r.due_date < CURRENT_DATE`
    );

    const adminIds = overdue.length > 0 ? await this.getAdminIds() : [];

    for (const rem of overdue) {
      await db.query(
        `UPDATE reminders SET status = 'overdue' WHERE id = $1`,
        [rem.id]
      );
      await NotificationService.reminderOverdue(rem, adminIds);
      console.log(`[Reminders] VENCIDO: "${rem.title}"`);
    }

    console.log(`[Reminders] Chequeo completo: ${upcoming.length + todayNoTime.length} próximos, ${overdue.length} vencidos`);
  },

  // Limpiar notificaciones viejas (> 30 días)
  async cleanOldNotifications() {
    const { rowCount } = await db.query(
      `DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '30 days'`
    );
    if (rowCount > 0) {
      console.log(`[Cleanup] ${rowCount} notificaciones antiguas eliminadas`);
    }
  }
};

module.exports = ReminderService;
