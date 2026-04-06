const logger = require("../config/logger");
const db = require('../config/db');
const NotificationService = require('./notificationService');
const TelegramService = require('./telegramService');
const { calcSlaDeadline, isNowBusinessHour } = require('../utils/slaUtils');

const SLAService = {
  // Acciones que cuentan como "primera gestión válida"
  // Regla: abrir el ticket o cambiar el estado NO cuenta.
  // Requiere una acción concreta sobre el cliente o el proceso.
  REAL_ACTIONS: [
    'contact_registered',  // Llamada, WhatsApp, presencial, email — method requerido
    'contact_evidence',    // Evidencia subida (foto/nota) — equivale a contacto real confirmado
    'note_added',          // Nota sustantiva — mínimo 20 caracteres
    'reminder_created',    // Crear recordatorio asociado al ticket
    'financing_updated',   // Cambiar estado financiamiento a algo concreto
    'test_ride_done',      // Marcar test ride realizado
  ],

  // Registrar una acción real en el ticket
  async registerAction(ticket_id, action_type) {
    if (!this.REAL_ACTIONS.includes(action_type)) return;

    const now = new Date().toISOString();
    await db.query(
      `UPDATE tickets SET
        last_real_action_at = $1,
        first_action_at = COALESCE(first_action_at, $1),
        sla_status = CASE
          WHEN sla_status IN ('breached', 'reassigned') THEN sla_status
          ELSE 'normal'
        END
       WHERE id = $2`,
      [now, ticket_id]
    );
  },

  // Obtener admins de una sucursal (para notificaciones)
  async getAdminIds(branch_id) {
    const { rows } = await db.query(
      `SELECT id FROM users
       WHERE role IN ('super_admin', 'admin_comercial')
       AND active = true
       AND (branch_id = $1 OR branch_id IS NULL)`,
      [branch_id]
    );
    return rows.map(r => r.id);
  },

  // Obtener backoffice users (para notificar ventas)
  async getBackofficeIds() {
    const { rows } = await db.query(
      `SELECT id FROM users WHERE role = 'backoffice' AND active = true`
    );
    return rows.map(r => r.id);
  },

  // Lógica oficial de asignación: least-loaded considerando branch_id + extra_branches
  // Usada tanto para leads manuales como importados
  async assignSeller(branch_id) {
    const { rows } = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.telegram_chat_id,
              COUNT(t.id) FILTER (WHERE t.status NOT IN ('ganado','perdido')) AS active_tickets
       FROM users u
       LEFT JOIN tickets t ON t.assigned_to = u.id
       WHERE u.role = 'vendedor'
         AND u.active = true
         AND (u.branch_id = $1 OR $1 = ANY(u.extra_branches))
       GROUP BY u.id, u.first_name, u.last_name, u.telegram_chat_id
       ORDER BY active_tickets ASC
       LIMIT 1`,
      [branch_id]
    );
    return rows[0] || null;
  },

  // Least-loaded excluyendo un conjunto de vendedores (para reasignación por SLA)
  // excluded_ids: array de UUIDs a excluir (puede ser vacío → sin exclusión)
  async findBestSeller(branch_id, excluded_ids = []) {
    const { rows } = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.telegram_chat_id,
              COUNT(t.id) FILTER (WHERE t.status NOT IN ('ganado','perdido')) AS active_tickets
       FROM users u
       LEFT JOIN tickets t ON t.assigned_to = u.id
       WHERE u.role = 'vendedor'
         AND u.active = true
         AND (u.branch_id = $1 OR $1 = ANY(u.extra_branches))
         AND u.id != ALL($2::uuid[])
       GROUP BY u.id, u.first_name, u.last_name, u.telegram_chat_id
       ORDER BY active_tickets ASC
       LIMIT 1`,
      [branch_id, excluded_ids]
    );
    return rows[0] || null;
  },

  // Reasignar un ticket (infinite rotation: todos los vendedores de la sucursal, rotando)
  async reassignTicket(ticket, reason = 'sla_breach', reassigned_by = null) {
    // Construir la lista completa de vendedores que ya tuvieron este ticket
    const { rows: logRows } = await db.query(
      `SELECT from_user_id, to_user_id FROM reassignment_log WHERE ticket_id = $1`,
      [ticket.id]
    );
    const seen = new Set();
    logRows.forEach(r => {
      if (r.from_user_id) seen.add(r.from_user_id);
      if (r.to_user_id) seen.add(r.to_user_id);
    });
    if (ticket.assigned_to) seen.add(ticket.assigned_to);
    const excludedAll = [...seen];

    // Intento 1: alguien de la sucursal que aún no tuvo el ticket
    let newSeller = await this.findBestSeller(ticket.branch_id, excludedAll);

    // Intento 2: todos ya lo tuvieron — reiniciar rotación, solo excluir al holder actual
    if (!newSeller && excludedAll.length > 1) {
      logger.info(`[SLA] Rotación completa para ticket #${ticket.ticket_number}, reiniciando ciclo`);
      newSeller = await this.findBestSeller(ticket.branch_id, [ticket.assigned_to]);
    }

    if (!newSeller) {
      logger.info(`[SLA] No hay vendedor disponible para reasignar ticket #${ticket.id}`);
      // Notificar a admins que no hay vendedor
      const adminIds = await this.getAdminIds(ticket.branch_id);
      await NotificationService.notifyMany(adminIds, {
        type: 'sla_breach',
        title: `⚠ Sin vendedor para reasignar ticket #${ticket.ticket_number}`,
        message: 'No hay vendedores disponibles en la sucursal. Reasignación manual requerida.',
        link_type: 'ticket',
        link_id: ticket.id
      });
      return null;
    }

    // Obtener datos del vendedor anterior (incluye telegram para notificarle la pérdida)
    const { rows: oldSellerRows } = await db.query(
      'SELECT first_name, last_name, telegram_chat_id FROM users WHERE id = $1',
      [ticket.assigned_to]
    );
    const oldSeller = oldSellerRows[0] || null;
    const oldSellerName = oldSeller
      ? `${oldSeller.first_name} ${oldSeller.last_name}`
      : 'Desconocido';

    const newDeadline = calcSlaDeadline().toISOString();

    // Actualizar ticket
    await db.query(
      `UPDATE tickets SET
        assigned_to = $1,
        sla_status = 'reassigned',
        sla_deadline = $2,
        first_action_at = NULL,
        reassignment_count = reassignment_count + 1
       WHERE id = $3`,
      [newSeller.id, newDeadline, ticket.id]
    );

    // Log de reasignación
    await db.query(
      `INSERT INTO reassignment_log (ticket_id, from_user_id, to_user_id, reason, reassigned_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [ticket.id, ticket.assigned_to, newSeller.id, reason, reassigned_by]
    );

    // Timeline del ticket
    await db.query(
      `INSERT INTO timeline (ticket_id, user_id, type, title, note)
       VALUES ($1, NULL, 'system', $2, $3)`,
      [
        ticket.id,
        `Reasignado a ${newSeller.first_name} ${newSeller.last_name}`,
        `Motivo: ${reason === 'sla_breach' ? 'SLA vencido' : reason}. Antes: ${oldSellerName}`
      ]
    );

    // Notificaciones
    await NotificationService.reassigned(ticket, newSeller.id, oldSellerName);

    // Enriquecer ticket con branch y modelo para las notificaciones
    const { rows: [ticketEnriched] } = await db.query(
      `SELECT t.*, b.name AS branch_name, m.brand AS moto_brand, m.model AS moto_model
       FROM tickets t
       LEFT JOIN branches b ON b.id = t.branch_id
       LEFT JOIN moto_models m ON m.id = t.model_id
       WHERE t.id = $1`, [ticket.id]
    );
    const ticketForNotif = ticketEnriched || ticket;

    // Telegram al nuevo vendedor (fire-and-forget)
    TelegramService.notifyReassigned(ticketForNotif, newSeller, oldSellerName, reason)
      .catch((e) => logger.warn('[Telegram] notifyReassigned error:', e.message));

    // Telegram al vendedor que perdió el lead (solo por SLA breach)
    if (reason === 'sla_breach' && oldSeller?.telegram_chat_id) {
      TelegramService.notifyLostLead(ticketForNotif, oldSeller)
        .catch((e) => logger.warn('[Telegram] notifyLostLead error:', e.message));
    }

    logger.info(`[SLA] Ticket #${ticket.ticket_number} reasignado de ${oldSellerName} a ${newSeller.first_name} ${newSeller.last_name}`);
    return newSeller;
  },

  _running: false,

  // Chequeo completo de SLA (llamado por el cron)
  async checkAll() {
    if (!isNowBusinessHour()) {
      logger.info('[SLA] Fuera de horario hábil (09:00–19:00 America/Santiago), saltando chequeo');
      return;
    }
    if (this._running) {
      logger.info('[SLA] Chequeo anterior aún en curso, saltando...');
      return;
    }
    this._running = true;
    try {
      const now = new Date();
      logger.info(`[SLA] Iniciando chequeo - ${now.toISOString()}`);

      // 1. Tickets WARNING — update atómico con RETURNING para evitar doble procesamiento
      // Incluye tickets 'reassigned' — el nuevo vendedor también merece aviso de 1h
      //
      // Por qué el SQL es correcto aunque la lógica de horario esté en slaUtils.js:
      //   - sla_deadline es un timestamp UTC absoluto calculado por calcSlaDeadline().
      //     Ya tiene la lógica de horario hábil "horneada" — no hay que re-aplicarla aquí.
      //   - sla_deadline - INTERVAL '1 hour' es aritmética UTC pura (siempre 3600 s,
      //     immune a DST). Significa "1 hora de reloj antes del vencimiento".
      //   - El guard isNowBusinessHour() al inicio de checkAll() garantiza que esta
      //     query solo corre dentro del horario hábil, por lo que "1 hora antes" siempre
      //     cae dentro de la ventana operativa (con el edge case documentado en slaUtils.js).
      const { rows: warningTickets } = await db.query(
        `UPDATE tickets SET sla_status = 'warning'
         WHERE id IN (
           SELECT t.id FROM tickets t
           WHERE t.status NOT IN ('ganado', 'perdido')
             AND t.first_action_at IS NULL
             AND t.sla_status IN ('normal', 'reassigned')
             AND t.sla_deadline - INTERVAL '1 hour' < NOW()
             AND t.sla_deadline > NOW()
         )
         RETURNING *, ticket_num as ticket_number,
                   NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '') as client_name`
      );

      for (const ticket of warningTickets) {
        const adminIds = await this.getAdminIds(ticket.branch_id);
        await NotificationService.slaWarning(ticket, ticket.assigned_to, adminIds);

        // Telegram SLA warning (fire-and-forget)
        db.query('SELECT telegram_chat_id FROM users WHERE id = $1', [ticket.assigned_to])
          .then(({ rows: [u] }) => u?.telegram_chat_id
            ? TelegramService.notifySlaWarning(ticket, u)
            : null)
          .catch((e) => logger.warn('[Telegram] slaWarning error:', e.message));

        logger.info(`[SLA] WARNING: Ticket #${ticket.ticket_number}`);
      }

      // 2. Tickets BREACH — update atómico con RETURNING
      // Incluye 'reassigned' directamente: si el cron saltó la ventana de warning, igual reasigna
      //
      // sla_deadline < NOW() es una comparación UTC simple: "¿ya pasó el deadline?"
      // Los tickets vencidos fuera de horario (e.g. deadline a las 11:00 pero el cron
      // no corrió) quedan pendientes y se procesan en la primera ejecución hábil siguiente,
      // gracias al guard isNowBusinessHour() al inicio de checkAll().
      const { rows: breachedTickets } = await db.query(
        `UPDATE tickets SET sla_status = 'breached'
         WHERE id IN (
           SELECT t.id FROM tickets t
           WHERE t.status NOT IN ('ganado', 'perdido')
             AND t.first_action_at IS NULL
             AND t.sla_status IN ('normal', 'warning', 'reassigned')
             AND t.sla_deadline < NOW()
         )
         RETURNING *, ticket_num as ticket_number,
                   NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '') as client_name`
      );

      for (const ticket of breachedTickets) {
        const adminIds = await this.getAdminIds(ticket.branch_id);
        await NotificationService.slaBreach(ticket, ticket.assigned_to, adminIds);
        await this.reassignTicket(ticket, 'sla_breach');
        logger.info(`[SLA] BREACH + REASIGNADO: Ticket #${ticket.ticket_number}`);
      }

      logger.info(`[SLA] Chequeo completo: ${warningTickets.length} warnings, ${breachedTickets.length} breaches`);
    } finally {
      this._running = false;
    }
  }
};

module.exports = SLAService;
