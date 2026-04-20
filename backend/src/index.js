const logger = require("./config/logger");
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// ── Validación de variables de entorno requeridas ──────────────────────────
// JWT secrets son obligatorios — sin ellos el sistema de auth no funciona
if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
  console.error('FATAL: JWT_SECRET y JWT_REFRESH_SECRET son requeridos');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);

// ── Security headers ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "https://res.cloudinary.com", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
const PORT = process.env.PORT || 4000;

// ── Rate limiting global ───────────────────────────────────────────────────
// 300 req / 15 min por IP — razonable para uso normal del CRM,
// protege contra scraping y abuso básico.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intenta en unos minutos' },
});
app.use('/api/', apiLimiter);

// Middleware
// Frontend y backend comparten el mismo origen en Railway — CORS solo aplica a cross-origin.
// Si FRONTEND_URL está seteada se usa como origen permitido, si no se permite same-origin.
const corsOrigin = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? false : '*');
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// API Routes (existentes)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/catalog', require('./routes/catalog'));
app.use('/api/users', require('./routes/users'));

// API Routes (nuevas - seguimiento comercial)
app.use('/api/import', require('./routes/import'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/reassignments', require('./routes/reassignments'));
app.use('/api/dashboard', require('./routes/dashboard'));

app.use('/api/sales',  require('./routes/sales'));
app.use('/api/supplier-payments', require('./routes/supplier-payments'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/priceimport', require('./routes/priceimport'));
app.use('/api/telegram',  require('./routes/telegram'));
app.use('/api/time-off',  require('./routes/timeOff'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'CRMaosBike API v2.0' }));

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      // index.html debe revalidar siempre — los assets (js/css) tienen hash en el nombre y pueden cachearse fuerte
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
    }
  });
}

// Error handler centralizado
const { errorHandler } = require('./middleware/errorHandler');
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`
  ╔═══════════════════════════════════╗
  ║  🏍️  CRMaosBike API v2.0        ║
  ║  Puerto: ${PORT}                    ║
  ║  SLA + Reminders + Notif activos ║
  ╚═══════════════════════════════════╝
  `);

  // Iniciar cron jobs de seguimiento comercial
  require('./jobs/slaChecker').start();
  require('./jobs/reminderChecker').start();

  // Registrar webhook de Telegram (no-op si TELEGRAM_WEBHOOK_URL no está configurada)
  require('./services/telegramService').setupWebhook();
});
