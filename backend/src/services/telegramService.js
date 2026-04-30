const https  = require('https');
const logger = require('../config/logger');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://crmaosbike.cl';

// ─── Helpers de texto ─────────────────────────────────────────────────────────

// Escape para parse_mode HTML — Telegram exige al menos &, <, > escapados.
// Es seguro contra inyección de markup independiente del contenido del usuario.
function esc(str) {
  if (str === null || str === undefined || str === '') return '—';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

// timeout en ms: polling usa 30s en Telegram, le damos 40s de margen
function apiCall(method, payload, socketTimeoutMs = 40000) {
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
        timeout: socketTimeoutMs,
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
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', (e) => {
      logger.warn(`[Telegram] ${method} error: ${e.message}`);
      resolve(null);
    });
    req.write(body);
    req.end();
  });
}

function sendMessage(chatId, text, inlineKeyboard) {
  // Convertir cualquier *bold* / _italic_ heredado a HTML antes de enviar.
  // Cualquier dato dinámico ya pasó por esc() (HTML-safe), por lo que no hay riesgo.
  const html = String(text)
    .replace(/\*([^\n*]+?)\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])_([^\n_]+?)_(?=$|[\s.,!?)])/g, '$1<i>$2</i>');
  const payload = { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true };
  if (inlineKeyboard) payload.reply_markup = { inline_keyboard: inlineKeyboard };
  return apiCall('sendMessage', payload);
}

// ─── Onboarding: /start ───────────────────────────────────────────────────────

// Render genérico del menú de vinculación — filtra por roles permitidos.
async function renderLinkMenu(chatId, db, { roles, welcomeText, emptyText }) {
  const { rows: users } = await db.query(
    `SELECT u.id, u.first_name, u.last_name, u.role, b.name AS branch_name
     FROM users u
     LEFT JOIN branches b ON u.branch_id = b.id
     WHERE u.role = ANY($1) AND u.active = true
     ORDER BY CASE u.role
                WHEN 'super_admin'     THEN 0
                WHEN 'admin_comercial' THEN 1
                WHEN 'backoffice'      THEN 2
                ELSE 3
              END, b.name NULLS LAST, u.first_name
     LIMIT 40`,
    [roles]
  );

  if (users.length === 0) {
    return sendMessage(chatId, welcomeText + '\n\n' + emptyText);
  }

  // Hasta 2 botones por fila para que se lea bien
  const buttons = [];
  for (let i = 0; i < users.length; i += 2) {
    const row = [
      {
        text: `${users[i].first_name} ${users[i].last_name}${users[i].branch_name ? ' · ' + users[i].branch_name : ''}`,
        callback_data: `link:${users[i].id}`,
      },
    ];
    if (users[i + 1]) {
      row.push({
        text: `${users[i + 1].first_name} ${users[i + 1].last_name}${users[i + 1].branch_name ? ' · ' + users[i + 1].branch_name : ''}`,
        callback_data: `link:${users[i + 1].id}`,
      });
    }
    buttons.push(row);
  }

  await sendMessage(chatId, welcomeText, buttons);
}

// /start — menú para vendedores (solo rol 'vendedor')
async function handleStart(chatId, db) {
  try {
    const welcomeText =
      `🏍️ *Bienvenido al bot de MaosBike CRM*\n\n` +
      `Te avisaré cuando te asignen un lead nuevo.\n\n` +
      `Para empezar, *selecciona tu nombre* en la lista de abajo:`;
    await renderLinkMenu(chatId, db, {
      roles: ['vendedor'],
      welcomeText,
      emptyText: '_No hay vendedores activos registrados. Contacta a un administrador._',
    });
  } catch (e) {
    logger.warn(`[Telegram] handleStart error: ${e.message}`);
  }
}

// /admin — menú para admins y backoffice (no aparece en la lista de vendedores)
async function handleStartAdmin(chatId, db) {
  try {
    const welcomeText =
      `🛠️ *Vinculación de administración*\n\n` +
      `Recibirás un aviso por cada venta o reserva registrada.\n\n` +
      `Seleccioná tu nombre:`;
    await renderLinkMenu(chatId, db, {
      roles: ['super_admin', 'admin_comercial', 'backoffice'],
      welcomeText,
      emptyText: '_No hay administradores activos registrados._',
    });
  } catch (e) {
    logger.warn(`[Telegram] handleStartAdmin error: ${e.message}`);
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

    // Usuario inválido, desactivado o con rol que no se vincula al bot.
    const LINKABLE = ['vendedor', 'admin_comercial', 'super_admin', 'backoffice'];
    if (!user || !user.active || !LINKABLE.includes(user.role)) {
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

    const isAdmin = user.role === 'super_admin' || user.role === 'admin_comercial';
    const scopeLine = isAdmin
      ? `Desde ahora te llegará un aviso cada vez que se registre una *venta* o *reserva*.`
      : `Desde ahora te llegará un aviso cada vez que te asignen un lead nuevo.`;

    const successText =
      `✅ *¡Cuenta vinculada exitosamente!*\n\n` +
      `👤 *${esc(user.first_name)} ${esc(user.last_name)}*\n\n` +
      `${scopeLine}\n` +
      `El resto de alertas las encuentras en la campanita del CRM.\n\n` +
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

    if (text === '/admin' || text.startsWith('/admin ')) {
      await handleStartAdmin(chatId, db);
      return;
    }

    // Cualquier otro mensaje → guiar al usuario
    await sendMessage(
      chatId,
      `Vendedores: usá /start para vincularte y recibir avisos de leads.\nAdmins y backoffice: usá /admin para recibir avisos de ventas y reservas. 🏍️`
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
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  const secret     = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token) {
    logger.info('[Telegram] TELEGRAM_BOT_TOKEN no configurado — bot desactivado');
    return null;
  }

  if (!webhookUrl) {
    // Sin URL de webhook → arrancar en modo polling (long-polling)
    logger.info('[Telegram] TELEGRAM_WEBHOOK_URL no configurada — iniciando modo polling');
    startPolling();
    return null;
  }

  // Borrar webhook previo para evitar conflicto si se venía en modo polling
  await apiCall('deleteWebhook', { drop_pending_updates: false });

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

// ─── Modo polling (fallback cuando no hay webhook URL) ────────────────────────

let _pollingActive = false;

function startPolling() {
  if (_pollingActive) return;
  _pollingActive = true;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  let offset = 0;

  async function poll() {
    if (!_pollingActive) return;
    try {
      // socketTimeoutMs = 35000: Telegram corta a los 30s, le damos 5s de margen
      const result = await apiCall('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message', 'callback_query'],
      }, 35000);

      if (result?.ok && Array.isArray(result.result)) {
        for (const update of result.result) {
          offset = update.update_id + 1;
          handleUpdate(update).catch(e =>
            logger.warn(`[Telegram] polling handleUpdate error: ${e.message}`)
          );
        }
      }
    } catch (e) {
      logger.warn(`[Telegram] polling error: ${e.message}`);
      // Esperar 5s antes de reintentar en caso de error de red
      await new Promise(r => setTimeout(r, 5000));
    }
    // Siguiente tick inmediato (long polling bloquea 30s en Telegram si no hay updates)
    setImmediate(poll);
  }

  logger.info('[Telegram] 🔄 Polling activo — escuchando /start y callbacks');
  poll();
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

  // Las notificaciones de reasignación, pérdida de lead y SLA se silencian en Telegram
  // por decisión de producto — demasiado ruido para el vendedor. Las in-app (campanita)
  // siguen funcionando normalmente vía NotificationService.
  async notifyReassigned() { return null; },
  async notifyLostLead()   { return null; },
  async notifySlaWarning() { return null; },

  // Aviso a super_admin / admin_comercial cada vez que se registra una venta o reserva.
  // El caller arma el objeto con los datos ya resueltos (sucursal/vendedor/cliente/montos).
  // Si el admin no tiene Telegram vinculado, se omite silenciosamente.
  // KILL SWITCH: env DISABLE_SALES_NOTIFY=true desactiva todas las
  // notificaciones de venta/reserva sin tocar los callsites — útil mientras
  // se ordena data sucia y no queremos spamear admins con cada cambio.
  async notifyAdminsOfSale(info) {
    if (process.env.DISABLE_SALES_NOTIFY === 'true') return;
    try {
      const db = require('../config/db');
      const { rows: admins } = await db.query(
        `SELECT id, first_name, last_name, telegram_chat_id
           FROM users
          WHERE role IN ('super_admin', 'admin_comercial', 'backoffice')
            AND telegram_chat_id IS NOT NULL
            AND active = true`
      );
      if (admins.length === 0) return;

      const isReserva = info.kind === 'reserva';
      const header = isReserva ? '📝 *Reserva registrada*' : '🎉 *Venta registrada*';

      const n = (v) => {
        if (v == null || v === '') return 0;
        const x = Number(v);
        return Number.isFinite(x) ? x : 0;
      };
      const money = (v) => {
        const x = n(v);
        return x > 0 ? '$' + x.toLocaleString('es-CL') : null;
      };

      // Moto
      const bike   = `${esc(info.brand || '')} ${esc(info.model || '')}`.trim() || '—';
      const year   = info.year  ? ` · ${info.year}`                : '';
      const color  = info.color ? `\n🎨 Color: ${esc(info.color)}` : '';
      const stock  = info.in_inventory
        ? `\n📦 Moto: estaba en inventario`
        : `\n📦 Moto: fuera de inventario`;

      // Desglose: precio venta (base que pone el vendedor) + extras + total
      const basePrice = n(info.sale_price) || n(info.list_price) || n(info.price);
      const chargeType = String(info.charge_type || '').toLowerCase();
      const chargeAmt  = n(info.charge_amt);
      const discount   = n(info.discount_amt);
      const accs = Array.isArray(info.accessories) ? info.accessories : [];

      const extrasLines = [];
      if (chargeAmt > 0) {
        const label = chargeType === 'completa'
          ? 'Documentación completa 📋'
          : chargeType === 'inscripcion'
            ? 'Inscripción vehicular 📝'
            : 'Documentación';
        extrasLines.push(`   • ${label}: ${money(chargeAmt)}`);
      }
      for (const a of accs) {
        const amt = n(a.amount);
        if (amt <= 0 && !a.description) continue;
        const desc = esc(String(a.description || 'Accesorio'));
        extrasLines.push(`   • ${desc}: ${money(amt) || '$0'}`);
      }
      if (discount > 0) {
        extrasLines.push(`   • Descuento: -${money(discount)}`);
      }

      const extrasSum = chargeAmt + accs.reduce((s, a) => s + n(a.amount), 0) - discount;
      const grandTotal = basePrice + extrasSum;

      let montos = '';
      if (basePrice > 0) montos += `\n💰 Precio venta: ${money(basePrice)}`;
      if (extrasLines.length) {
        montos += `\n➕ Extras:\n${extrasLines.join('\n')}`;
      }
      if (grandTotal > 0 && (extrasLines.length || isReserva)) {
        montos += `\n🧾 Valor total: *${money(grandTotal)}*`;
      } else if (grandTotal > 0) {
        montos += `\n🧾 Valor total: *${money(grandTotal)}*`;
      }
      if (isReserva) {
        const abono = n(info.invoice_amount);
        if (abono > 0) {
          montos += `\n💵 Abono pagado: *${money(abono)}*`;
          const saldo = grandTotal - abono;
          if (saldo > 0) montos += `\n⏳ Saldo pendiente: ${money(saldo)}`;
        }
      }

      // Detalles
      const payment  = info.payment_method ? `\n💳 Medio de pago: ${esc(info.payment_method)}` : '';
      const notes    = info.sale_notes     ? `\n🗒️ Notas: ${esc(info.sale_notes)}`             : '';

      // Partes
      const client = `\n🧑 Cliente: ${esc(info.client_name || '—')}`;
      const rut    = info.client_rut  ? `\n📇 RUT: ${esc(info.client_rut)}`       : '';
      const branch = info.branch_name ? `\n🏢 Sucursal: ${esc(info.branch_name)}` : '';
      const seller = info.seller_name ? `\n👤 Vendedor: ${esc(info.seller_name)}` : '';

      const text =
        `${header}\n\n` +
        `🏍️ ${bike}${year}${color}${stock}` +
        montos +
        payment + notes +
        client + rut + branch + seller;

      // Sin botones — la notificación va limpia.
      for (const a of admins) {
        await sendMessage(a.telegram_chat_id, text);
      }
    } catch (e) {
      logger.warn(`[Telegram] notifyAdminsOfSale error: ${e.message}`);
    }
  },

  // Onboarding / webhook / polling
  handleUpdate,
  setupWebhook,
  startPolling,
};

module.exports = TelegramService;
