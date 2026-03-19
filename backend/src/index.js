require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));

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

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

app.listen(PORT, () => {
  console.log(`
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
