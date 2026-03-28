const https = require('https');
const logger = require('../config/logger');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://crmaosbike.cl';

// Normalize phone to wa.me format (digits only, with country code)
function normalizePhoneForWA(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 9 && digits.startsWith('9')) return `56${digits}`;
  if (digits.length === 10 && digits.startsWith('09')) return `56${digits.slice(1)}`;
  if (digits.length >= 11) return digits;
  return digits.length >= 8 ? digits : null;
}

function buildWALink(phone, clientName, modelName) {
  const normalized = normalizePhoneForWA(phone);
  if (!normalized) return null;
  const modelPart = modelName ? `la cotización de tu ${modelName}` : 'nuestra oferta';
  const msg = `Hola ${clientName || ''}, te contactamos desde AOS Bike para coordinar ${modelPart}. ¿Tienes un momento?`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`;
}

function priorityLabel(p) {
  const map = { alta: '🔴 Alta', media: '🟡 Media', baja: '🟢 Baja' };
  return map[p] || '🟡 Media';
}

// Escape Markdown v1 special chars
function esc(str) {
  if (!str) return '';
  return String(str).replace(/[_*`[]/g, '\\$&');
}

function sendMessage(chatId, text, inlineKeyboard) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn('[Telegram] TELEGRAM_BOT_TOKEN no configurado — notificación omitida');
    return Promise.resolve(null);
  }

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: inlineKeyboard },
  };

  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (!parsed.ok) logger.warn(`[Telegram] API error: ${parsed.description}`);
            resolve(parsed);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', (e) => {
      logger.warn(`[Telegram] Request error: ${e.message}`);
      resolve(null); // never throw — notifications must not break main flow
    });
    req.write(body);
    req.end();
  });
}

const TelegramService = {
  /**
   * Notify vendedor of a new lead assigned to them.
   * @param {object} ticket - ticket row + optional moto_brand, moto_model, branch_name
   * @param {object} seller - user row, must include telegram_chat_id
   */
  async notifyNewLead(ticket, seller) {
    if (!seller?.telegram_chat_id) return;

    const clientName = [ticket.first_name, ticket.last_name].filter(Boolean).join(' ') || 'Sin nombre';
    const modelName =
      ticket.moto_brand && ticket.moto_model
        ? `${ticket.moto_brand} ${ticket.moto_model}`
        : ticket.model_name || '—';
    const branchName = ticket.branch_name || '—';
    const crmLink = `${FRONTEND_URL}/leads/${ticket.id}`;

    const financiamiento = ticket.wants_financing ? `\n💳 Financiamiento: Sí` : '';

    const text =
      `🚨 *Nuevo lead asignado*\n\n` +
      `👤 Cliente: ${esc(clientName)}\n` +
      `🛵 Modelo: ${esc(modelName)}\n` +
      `🏢 Sucursal: ${esc(branchName)}` +
      financiamiento;

    const keyboard = [
      [{ text: 'Abrir CRM', url: crmLink }],
    ];

    return sendMessage(seller.telegram_chat_id, text, keyboard);
  },

  /**
   * Notify vendedor that a lead was reassigned to them.
   * @param {object} ticket - ticket row + optional branch_name
   * @param {object} newSeller - user row with telegram_chat_id
   * @param {string} fromName - name of previous seller
   * @param {string} reason - 'sla_breach' | 'manual'
   */
  async notifyReassigned(ticket, newSeller, fromName, reason = 'sla_breach') {
    if (!newSeller?.telegram_chat_id) return;

    const clientName = [ticket.first_name, ticket.last_name].filter(Boolean).join(' ') || 'Sin nombre';
    const modelName =
      ticket.moto_brand && ticket.moto_model
        ? `${ticket.moto_brand} ${ticket.moto_model}`
        : ticket.model_name || null;
    const branchName = ticket.branch_name || '';
    const ticketNum = ticket.ticket_num || ticket.ticket_number || '';
    const waLink = buildWALink(ticket.phone, clientName, modelName);
    const crmLink = `${FRONTEND_URL}/leads/${ticket.id}`;
    const reasonLabel = reason === 'manual' ? 'Reasignación manual' : 'SLA vencido (auto)';

    const text =
      `🔄 *Lead Reasignado a Ti*\n` +
      `────────────────────\n` +
      `👤 *${esc(clientName)}*\n` +
      (ticket.phone ? `📱 ${esc(ticket.phone)}\n` : '') +
      (modelName ? `🛵 ${esc(modelName)}\n` : '') +
      (branchName ? `🏢 ${esc(branchName)}\n` : '') +
      `⚡ Prioridad: *${priorityLabel(ticket.priority)}*\n` +
      `📋 Motivo: ${esc(reasonLabel)}\n` +
      (fromName ? `↩️ Antes: ${esc(fromName)}\n` : '') +
      `🕐 SLA: 8 horas disponibles\n\n` +
      `Ticket: \`${esc(ticketNum)}\``;

    const keyboard = [
      [{ text: '🔗 Ver Lead en CRM', url: crmLink }],
      ...(waLink ? [[{ text: '💬 Abrir WhatsApp', url: waLink }]] : []),
    ];

    return sendMessage(newSeller.telegram_chat_id, text, keyboard);
  },

  /**
   * Notify vendedor that their SLA is about to expire (< 2h remaining).
   * @param {object} ticket - ticket row
   * @param {object} seller - user row with telegram_chat_id
   */
  async notifySlaWarning(ticket, seller) {
    if (!seller?.telegram_chat_id) return;

    const clientName = [ticket.first_name, ticket.last_name].filter(Boolean).join(' ') || 'Sin nombre';
    const ticketNum = ticket.ticket_num || ticket.ticket_number || '';
    const waLink = buildWALink(ticket.phone, clientName, null);
    const crmLink = `${FRONTEND_URL}/leads/${ticket.id}`;

    const text =
      `⚠️ *SLA Próximo a Vencer*\n` +
      `────────────────────\n` +
      `Quedan *menos de 2 horas* para gestionar:\n\n` +
      `👤 *${esc(clientName)}*\n` +
      (ticket.phone ? `📱 ${esc(ticket.phone)}\n` : '') +
      `\nTicket: \`${esc(ticketNum)}\``;

    const keyboard = [
      [{ text: '🔗 Gestionar ahora', url: crmLink }],
      ...(waLink ? [[{ text: '💬 Abrir WhatsApp', url: waLink }]] : []),
    ];

    return sendMessage(seller.telegram_chat_id, text, keyboard);
  },
};

module.exports = TelegramService;
