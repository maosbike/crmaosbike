const logger = require("./config/logger");
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// ── Validación de variables de entorno requeridas ──────────────────────────
// JWT secrets son obligatorios — sin ellos el sistema de auth no funciona.
// Validamos también longitud y rechazamos valores conocidos / placeholders.
const FORBIDDEN_SECRETS = new Set([
  'tu_clave_secreta_aqui_cambiar',
  'changeme',
  'secret',
  'jwt_secret',
  'please_change_me',
  'default',
]);
function assertSecret(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`FATAL: ${name} es requerido`);
    process.exit(1);
  }
  if (v.length < 32) {
    console.error(`FATAL: ${name} debe tener al menos 32 caracteres (recomendado 64). Generá uno con: openssl rand -hex 64`);
    process.exit(1);
  }
  if (FORBIDDEN_SECRETS.has(v.toLowerCase())) {
    console.error(`FATAL: ${name} usa un valor placeholder conocido. Cambialo antes de arrancar.`);
    process.exit(1);
  }
}
assertSecret('JWT_SECRET');
assertSecret('JWT_REFRESH_SECRET');
if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
  console.error('FATAL: JWT_SECRET y JWT_REFRESH_SECRET deben ser diferentes');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && !process.env.TELEGRAM_WEBHOOK_SECRET && process.env.TELEGRAM_BOT_TOKEN) {
  console.error('FATAL: TELEGRAM_WEBHOOK_SECRET es requerido en producción cuando TELEGRAM_BOT_TOKEN está configurado');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

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
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      // upgradeInsecureRequests no se setea en dev; en prod helmet lo agrega vía hsts.
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: {
    maxAge: 63072000,        // 2 años
    includeSubDomains: true,
    preload: true,
  },
}));

// Force HTTPS en producción (Railway termina TLS y setea x-forwarded-proto).
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') return next();
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  });
}
const PORT = process.env.PORT || 4000;

// ── Rate limiting global ───────────────────────────────────────────────────
// 2000 req / 15 min por IP — uso normal del CRM en sesión de trabajo
// (admin filtrando ventas, abriendo fichas, vinculando facturas) supera
// fácilmente las 300 req/15min del límite anterior. Sigue protegiendo
// contra scraping/abuso pero no estrangula al usuario legítimo.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intenta en unos minutos' },
});
app.use('/api/', apiLimiter);

// Middleware
// CORS estricto con allowlist explícita. En same-origin (Railway) no se necesita.
// FRONTEND_URL puede ser un valor o lista CSV; se valida contra cada request.
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // Same-origin (curl/server-to-server) no envía Origin → permitir.
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    // Dev con NODE_ENV=development y FRONTEND_URL vacío → permitir cualquier origen.
    if (process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0) return cb(null, true);
    return cb(new Error(`Origin no permitido: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));

// Body parser: 2MB es suficiente para JSON normal del CRM. Los uploads van por
// multer (que tiene sus propios límites por ruta).
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(cookieParser());

// Defensa anti prototype pollution: bloquea __proto__, constructor, prototype
// como llaves en req.body / req.query / req.params antes de cualquier handler.
app.use((req, res, next) => {
  const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];
  function check(obj) {
    if (!obj || typeof obj !== 'object') return false;
    for (const k of Object.keys(obj)) {
      if (BAD_KEYS.includes(k)) return true;
      const v = obj[k];
      if (v && typeof v === 'object' && check(v)) return true;
    }
    return false;
  }
  if (check(req.body) || check(req.query) || check(req.params)) {
    return res.status(400).json({ error: 'Payload inválido' });
  }
  next();
});

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
app.use('/api/accounting', require('./routes/accounting'));

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
