const logger = require("./config/logger");
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

// ── Validación de variables de entorno requeridas ──────────────────────────
// El servidor no arranca si faltan variables críticas de seguridad
const missingVars = [];
if (!process.env.JWT_SECRET)         missingVars.push('JWT_SECRET');
if (!process.env.JWT_REFRESH_SECRET) missingVars.push('JWT_REFRESH_SECRET');
if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) missingVars.push('FRONTEND_URL');
if (missingVars.length > 0) {
  console.error(`FATAL: Variables de entorno requeridas no configuradas: ${missingVars.join(', ')}`);
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 4000;

// Middleware
// En producción, FRONTEND_URL es obligatorio (validado arriba) — nunca '*'
const corsOrigin = process.env.FRONTEND_URL || (process.env.NODE_ENV !== 'production' ? '*' : null);
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

app.use('/api/admin', require('./routes/admin'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/priceimport', require('./routes/priceimport'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'CRMaosBike API v2.0' }));

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
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
});
