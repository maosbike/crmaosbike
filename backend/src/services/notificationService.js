const db = require('../config/db');

// Fuente oficial del nombre visible de un lead.
// Prioriza first_name + last_name reales. Nunca devuelve "Sin nombre".
function dn(ticket) {
  return [ticket.first_name, ticket.last_name].filter(Boolean).join(' ').trim()
    || ticket.ticket_num
    || ticket.ticket_number
    || '—';
}

const NotificationService = {
  // Crear una notificación
  async create({ user_id, type, title, message, link_type, link_id }) {
    const { rows } = await db.query(
      `INSERT INTO notifications (user_id, type, title, message, link_type, link_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [user_id, type, title, message || null, link_type || null, link_id || null]
    );
    return rows[0];
  },

  // Notificar a múltiples usuarios
  async notifyMany(user_ids, { type, title, message, link_type, link_id }) {
    const promises = user_ids.map(uid =>
      this.create({ user_id: uid, type, title, message, link_type, link_id })
    );
    return Promise.all(promises);
  },

  // Notificar nuevo lead asignado
  async newLeadAssigned(ticket, seller_id) {
    return this.create({
      user_id: seller_id,
      type: 'new_lead',
      title: `Nuevo lead asignado: ${dn(ticket)}`,
      message: `Ticket #${ticket.ticket_num || ticket.ticket_number} - Tienes 3 horas para gestionarlo`,
      link_type: 'ticket',
      link_id: ticket.id
    });
  },

  // Notificar SLA warning
  async slaWarning(ticket, seller_id, admin_ids = []) {
    const notifs = [];
    notifs.push(this.create({
      user_id: seller_id,
      type: 'sla_warning',
      title: `⚠ Lead próximo a vencer: ${dn(ticket)}`,
      message: `Queda menos de 1 hora para gestionar el ticket #${ticket.ticket_num || ticket.ticket_number}`,
      link_type: 'ticket',
      link_id: ticket.id
    }));
    for (const aid of admin_ids) {
      notifs.push(this.create({
        user_id: aid,
        type: 'sla_warning',
        title: `⚠ Lead próximo a vencer: ${dn(ticket)}`,
        message: `El vendedor no ha gestionado este lead`,
        link_type: 'ticket',
        link_id: ticket.id
      }));
    }
    return Promise.all(notifs);
  },

  // Notificar SLA breach
  async slaBreach(ticket, seller_id, admin_ids = []) {
    const notifs = [];
    notifs.push(this.create({
      user_id: seller_id,
      type: 'sla_breach',
      title: `🔴 SLA vencido: ${dn(ticket)}`,
      message: `No gestionaste el ticket #${ticket.ticket_num || ticket.ticket_number} a tiempo. Será reasignado.`,
      link_type: 'ticket',
      link_id: ticket.id
    }));
    for (const aid of admin_ids) {
      notifs.push(this.create({
        user_id: aid,
        type: 'sla_breach',
        title: `🔴 SLA vencido: ${dn(ticket)}`,
        message: `Lead no gestionado, se procederá con reasignación automática`,
        link_type: 'ticket',
        link_id: ticket.id
      }));
    }
    return Promise.all(notifs);
  },

  // Notificar reasignación
  async reassigned(ticket, new_seller_id, old_seller_name) {
    return this.create({
      user_id: new_seller_id,
      type: 'reassigned',
      title: `Lead reasignado a ti: ${dn(ticket)}`,
      message: `Ticket #${ticket.ticket_num || ticket.ticket_number} fue reasignado desde ${old_seller_name}. Tienes 3 horas.`,
      link_type: 'ticket',
      link_id: ticket.id
    });
  },

  // Notificar recordatorio próximo
  async reminderDue(reminder) {
    return this.create({
      user_id: reminder.assigned_to,
      type: 'reminder_due',
      title: `📋 Recordatorio: ${reminder.title}`,
      message: reminder.description || 'Tienes un recordatorio pendiente',
      link_type: reminder.ticket_id ? 'ticket' : 'reminder',
      link_id: reminder.ticket_id || reminder.id
    });
  },

  // Notificar recordatorio vencido
  async reminderOverdue(reminder, admin_ids = []) {
    const notifs = [];
    notifs.push(this.create({
      user_id: reminder.assigned_to,
      type: 'reminder_overdue',
      title: `⏰ Recordatorio vencido: ${reminder.title}`,
      message: 'Este recordatorio no fue completado a tiempo',
      link_type: reminder.ticket_id ? 'ticket' : 'reminder',
      link_id: reminder.ticket_id || reminder.id
    }));
    for (const aid of admin_ids) {
      notifs.push(this.create({
        user_id: aid,
        type: 'reminder_overdue',
        title: `⏰ Recordatorio vencido de vendedor`,
        message: `"${reminder.title}" no fue completado`,
        link_type: reminder.ticket_id ? 'ticket' : 'reminder',
        link_id: reminder.ticket_id || reminder.id
      }));
    }
    return Promise.all(notifs);
  },

  // Lead ganado - notificar backoffice
  async leadWon(ticket, backoffice_ids = []) {
    return this.notifyMany(backoffice_ids, {
      type: 'lead_won',
      title: `🎉 Venta cerrada: ${dn(ticket)}`,
      message: `Ticket #${ticket.ticket_num || ticket.ticket_number} ganado. Iniciar post-venta.`,
      link_type: 'ticket',
      link_id: ticket.id
    });
  }
};

module.exports = NotificationService;
