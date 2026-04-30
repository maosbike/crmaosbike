const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const logger  = require('../config/logger');
const TelegramService = require('../services/telegramService');

// POST /api/telegram/webhook
// El secret token es obligatorio en producción (validado al boot en index.js).
// En dev sigue siendo opcional para facilitar pruebas locales.
router.post('/webhook', (req, res) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  // En producción exigimos secret. Si no está, el boot ya falló — defensa redundante.
  if (process.env.NODE_ENV === 'production' && !secret) {
    logger.error('[Telegram] Webhook recibido sin secret configurado — bloqueado');
    return res.sendStatus(403);
  }

  if (secret) {
    const incoming = req.headers['x-telegram-bot-api-secret-token'];
    // Constant-time compare para evitar timing attacks sobre el secret.
    const a = Buffer.from(String(incoming || ''));
    const b = Buffer.from(secret);
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) {
      logger.warn('[Telegram] Webhook recibido con secret inválido');
      return res.sendStatus(403);
    }
  }

  res.sendStatus(200);
  TelegramService.handleUpdate(req.body).catch((e) => {
    logger.warn(`[Telegram] handleUpdate unhandled error: ${e.message}`);
  });
});

module.exports = router;
