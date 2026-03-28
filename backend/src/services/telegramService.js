const https = require('https');
const logger = require('../config/logger');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://crmaosbike.cl';

// Escape Markdown v1 special chars
function esc(str) {
  if (!str) return '—';
  return String(str).replace(/[_*`[]/g, '\\$&');
}

// Format date as dd/mm/yyyy HH:MM (Santiago time)
function formatDateTime(date) {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleString('es-CL', {
      timeZone: 'America/Santiago',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '—';
  }
}

function sellerName(seller) {
  return esc([seller?.first_name, seller?.last_name].filter(Boolean).join(' ') || 'Sin asignar');
}

function clientName(ticket) {
  return esc([ticket.first_name, ticket.last_name].filter(Boolean).join(' ') || 'Sin nombre');
}

function modelLines(ticket) {
  if (ticket.moto_brand && ticket.moto_model) {
    return `🏭 Marca: ${esc(ticket.moto_brand)}\n🛵 Modelo: ${esc(ticket.moto_model)}`;
  }
  const full = ticket.model_name || '—';
  return `🛵 Modelo: ${esc(full)}`;
}

function branchName(ticket) {
  return esc(ticket.branch_name || '—');
}

function crmButton(ticketId) {
  return [[{ text: 'Abrir CRM', url: `${FRONTEND_URL}/leads/${ticketId}` }]];
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
      resolve(null);
    });
    req.write(body);
    req.end();
  });
}

const TelegramService = {
  // ─── 1. Lead nuevo asignado ────────────────────────────────
  async notifyNewLead(ticket, seller) {
    if (!seller?.telegram_chat_id) return;

    const financing = ticket.wants_financing ? `\n💳 Financiamiento: Sí` : '';

    const text =
      `🚨 *Nuevo lead asignado*\n\n` +
      `👤 Vendedor: ${sellerName(seller)}\n` +
      `🧑 Cliente: ${clientName(ticket)}\n` +
      `${modelLines(ticket)}\n` +
      `🏢 Sucursal: ${branchName(ticket)}\n` +
      `📅 Cotizó: ${formatDateTime(ticket.created_at)}` +
      financing;

    return sendMessage(seller.telegram_chat_id, text, crmButton(ticket.id));
  },

  // ─── 2. Lead reasignado — mensaje al nuevo vendedor ────────
  async notifyReassigned(ticket, newSeller, _fromName, _reason) {
    if (!newSeller?.telegram_chat_id) return;

    const text =
      `🔄 *Lead reasignado*\n\n` +
      `👤 Vendedor: ${sellerName(newSeller)}\n` +
      `🧑 Cliente: ${clientName(ticket)}\n` +
      `${modelLines(ticket)}\n` +
      `🏢 Sucursal: ${branchName(ticket)}`;

    return sendMessage(newSeller.telegram_chat_id, text, crmButton(ticket.id));
  },

  // ─── 3. Lead perdido por falta de gestión — al vendedor que lo pierde ──
  async notifyLostLead(ticket, oldSeller) {
    if (!oldSeller?.telegram_chat_id) return;

    const text =
      `⚠️ *Lead reasignado por falta de gestión*\n\n` +
      `👤 Vendedor: ${sellerName(oldSeller)}\n` +
      `🧑 Cliente: ${clientName(ticket)}\n` +
      `${modelLines(ticket)}\n` +
      `🏢 Sucursal: ${branchName(ticket)}`;

    return sendMessage(oldSeller.telegram_chat_id, text, crmButton(ticket.id));
  },

  // ─── SLA warning — sin cambios de formato por ahora ────────
  async notifySlaWarning(ticket, seller) {
    if (!seller?.telegram_chat_id) return;

    const text =
      `⏰ *SLA próximo a vencer*\n\n` +
      `👤 Vendedor: ${sellerName(seller)}\n` +
      `🧑 Cliente: ${clientName(ticket)}\n` +
      `🏢 Sucursal: ${branchName(ticket)}\n` +
      `Queda menos de 1 hora para gestionar este lead.`;

    return sendMessage(seller.telegram_chat_id, text, crmButton(ticket.id));
  },
};

module.exports = TelegramService;
