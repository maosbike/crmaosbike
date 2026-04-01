const express = require('express');
const router  = express.Router();
const logger  = require('../config/logger');
const TelegramService = require('../services/telegramService');

// POST /api/telegram/webhook
// Recibe updates de Telegram. Protegido por secret_token si TELEGRAM_WEBHOOK_SECRET está seteado.
router.post('/webhook', (req, res) => {
  // Validar secret header si está configurado
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const incoming = req.headers['x-telegram-bot-api-secret-token'];
    if (incoming !== secret) {
      logger.warn('[Telegram] Webhook recibido con secret inválido');
      return res.sendStatus(403);
    }
  }

  // Responder 200 de inmediato — Telegram reintenta si no recibe respuesta rápida
  res.sendStatus(200);

  // Procesar el update de forma asíncrona (no bloquea la respuesta)
  TelegramService.handleUpdate(req.body).catch((e) => {
    logger.warn(`[Telegram] handleUpdate unhandled error: ${e.message}`);
  });
});

module.exports = router;
