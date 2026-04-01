const https  = require('https');
const logger = require('../config/logger');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://crmaosbike.cl';

// ─── Helpers de texto ─────────────────────────────────────────────────────────

function esc(str) {
  if (!str) return '—';
  return String(str).replace(/[_*`[]/g, '\\$&');
}

function formatDateTime(date) {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleString('es-CL', {
      timeZone: 'America/Santiago',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return '—'; }
}

function sellerName(seller) {
  return esc([seller?.first_name, seller?.last_name].filter(Boolean).join(' ') || 'Sin asignar');
}
function clientName(ticket) {
  return esc([ticket.first_name, ticket.last_name].filter(Boolean).join(' ') || 'Sin nombre');
}
function modelLines(ticket) {
  if (ticket.moto_brand && ticket.moto_model)
    return `🏭 Marca: ${esc(ticket.moto_brand)}\n🛵 Modelo: ${esc(ticket.moto_model)}`;
  return `🛵 Modelo: ${esc(ticket.model_name || '—')}`;
}
function branchName(ticket) { return esc(ticket.branch_name || '—'); }
function crmButton(ticketId) {
  return [[{ text: '🔗 Abrir CRM', url: `${FRONTEND_URL}/leads/${ticketId}` }]];
}

// ─── Transporte HTTP (base interna) ──────────────────────────────────────────

function apiCall(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn('[Telegram] TELEGRAM_BOT_TOKEN no configurado');
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req  = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/${method}`,
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
          try   { resolve(JSON.parse(data)); }
          catch { resolve(null); }
        });
      }
    );
    req.on('error', (e) => {
      logger.warn(`[Telegram] ${method} error: ${e.message}`);
      resolve(null);
    });
    req.write(body);
    req.end();
  });
}

function sendMessage(chatId, text, inlineKeyboard) {
  const payload = { chat_id: chatId, text, parse_mode: 'Markdown' };
  if (inlineKeyboard) payload.reply_markup = { inline_keyboard: inlineKeyboard };
  return apiCall('sendMessage', payload);
}

// ─── Onboarding: /start ───────────────────────────────────────────────────────

async function handleStart(chatId, db) {
  try {
    const { rows: sellers } = await db.query(
      `SELECT u.id, u.first_name, u.last_name, b.name AS branch_name
       FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.role = 'vendedor' AND u.active = true
       ORDER BY b.name NULLS LAST, u.first_name
       LIMIT 30`
    );

    const welcomeText =
      `🏍️ *Bienvenido al bot de MaosBike CRM*\n\n` +
      `Este bot te enviará notificaciones directamente cuando:\n` +
      `📥 Te asignen un lead nuevo\n` +
      `⏰ Un lead esté por vencer su plazo de atención\n` +
      `🔄 Te reasignen o pierdas un lead\n\n` +
      `Para empezar, *selecciona tu nombre* en la lista de abajo:`;

    if (sellers.length === 0) {
      return sendMessage(chatId, welcomeText + '\n\n_No hay vendedores activos registrados en el sistema. Contacta a un administrador._');
    }

    // Mostrar hasta 2 botones por fila para que se lea bien
    const buttons = [];
    for (let i = 0; i < sellers.length; i += 2) {
      const row = [
        {
          text: `${sellers[i].first_name} ${sellers[i].last_name}${sellers[i].branch_name ? ' · ' + sellers[i].branch_name : ''}`,
          callback_data: `link:${sellers[i].id}`,
        },
      ];
      if (sellers[i + 1]) {
        row.push({
          text: `${sellers[i + 1].first_name} ${sellers[i + 1].last_name}${sellers[i + 1].branch_name ? ' · ' + sellers[i + 1].branch_name : ''}`,
          callback_data: `link:${sellers[i + 1].id}`,
        });
      }
      buttons.push(row);
    }

    await sendMessage(chatId, welcomeText, buttons);
  } catch (e) {
    logger.warn(`[Telegram] handleStart error: ${e.message}`);
  }
}

// ─── Onboarding: callback del botón ──────────────────────────────────────────

async function handleLinkCallback(chatId, userId, callbackQueryId, db) {
  try {
    const { rows } = await db.query(
      `SELECT id, first_name, last_name, telegram_chat_id, role, active
       FROM users WHERE id = $1`,
      [userId]
    );
    const user = rows[0];

    // Usuario inválido o desactivado
    if (!user || !user.active || user.role !== 'vendedor') {
      await apiCall('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: '❌ Usuario no encontrado o no disponible.',
        show_alert: true,
      });
      return;
    }

    const chatIdStr = String(chatId);

    // Ya estaba vinculado al mismo chat → sin cambio
    if (user.telegram_chat_id === chatIdStr) {
      await apiCall('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: '✅ Ya estás vinculado',
      });
      await sendMessage(
        chatId,
        `✅ *Ya estás vinculado* como ${esc(user.first_name)} ${esc(user.last_name)}.\n\nEstás recibiendo notificaciones en este chat.`
      );
      return;
    }

    // Limpiar cualquier otro usuario que esté usando este chat_id
    // (evita duplicados si se vinculó antes con otro nombre)
    await db.query(
      `UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = $1 AND id != $2`,
      [chatIdStr, userId]
    );

    // Vincular este chat al usuario elegido
    await db.query(
      `UPDATE users SET telegram_chat_id = $1, updated_at = NOW() WHERE id = $2`,
      [chatIdStr, userId]
    );

    await apiCall('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: '✅ ¡Vinculado correctamente!',
    });

    const successText =
      `✅ *¡Cuenta vinculada exitosamente!*\n\n` +
      `👤 *${esc(user.first_name)} ${esc(user.last_name)}*\n\n` +
      `Desde ahora recibirás notificaciones en este chat:\n` +
      `📥 Leads nuevos asignados a ti\n` +
      `⏰ Alertas de SLA próximo a vencer\n` +
      `🔄 Avisos de reasignaciones\n\n` +
      `_Si cambias de dispositivo, usa /start nuevamente para re-vincular._`;

    await sendMessage(chatId, successText);
  } catch (e) {
    logger.warn(`[Telegram] handleLinkCallback error: ${e.message}`);
  }
}

// ─── Dispatcher principal de updates ─────────────────────────────────────────

async function handleUpdate(update) {
  const db = require('../config/db'); // lazy require — evita circular deps al inicio

  // Mensajes de texto (comandos)
  if (update.message) {
    const chatId = update.message.chat.id;
    const text   = update.message.text || '';

    if (text === '/start' || text.startsWith('/start ')) {
      await handleStart(chatId, db);
      return;
    }

    // Cualquier otro mensaje → guiar al usuario
    await sendMessage(
      chatId,
      `Usa /start para vincular tu cuenta y empezar a recibir notificaciones de leads. 🏍️`
    );
    return;
  }

  // Callback queries (botones inline)
  if (update.callback_query) {
    const { id: callbackQueryId, from, data } = update.callback_query;
    const chatId = from.id; // en chats privados from.id === chat.id

    if (data?.startsWith('link:')) {
      const userId = data.slice(5); // todo lo que sigue de 'link:'
      await handleLinkCallback(chatId, userId, callbackQueryId, db);
    } else {
      // callback desconocido → ack silencioso
      await apiCall('answerCallbackQuery', { callback_query_id: callbackQueryId });
    }
  }
}

// ─── Registro del webhook en Telegram ────────────────────────────────────────

async function setupWebhook() {
  const token      = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL; // ej: https://crmaosbike.cl/api/telegram/webhook
  const secret     = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token || !webhookUrl) {
    logger.info('[Telegram] TELEGRAM_WEBHOOK_URL no configurada — webhook no registrado (modo solo-envío)');
    return null;
  }

  const payload = { url: webhookUrl, allowed_updates: ['message', 'callback_query'] };
  if (secret) payload.secret_token = secret;

  const result = await apiCall('setWebhook', payload);
  if (result?.ok) {
    logger.info(`[Telegram] ✅ Webhook registrado → ${webhookUrl}`);
  } else {
    logger.warn(`[Telegram] ⚠ Error registrando webhook: ${result?.description}`);
  }
  return result;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

const TelegramService = {
  // Notificaciones existentes (sin cambios)
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

  // Onboarding / webhook
  handleUpdate,
  setupWebhook,
};

module.exports = TelegramService;
