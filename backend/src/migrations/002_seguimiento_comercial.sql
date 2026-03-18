-- ================================================
-- MIGRACIÓN: Sistema de Seguimiento Comercial
-- CRMaosBike v2.0
-- Ejecutar en Railway PostgreSQL
-- ================================================

-- 1. Nuevos campos en tabla tickets
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_deadline TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS first_action_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_status VARCHAR(20) DEFAULT 'normal';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reassignment_count INTEGER DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS last_real_action_at TIMESTAMPTZ;

-- Calcular SLA para tickets existentes
UPDATE tickets SET sla_deadline = created_at + INTERVAL '8 hours'
  WHERE sla_deadline IS NULL;

UPDATE tickets SET sla_status = CASE
  WHEN status IN ('ganado','perdido','cerrado') THEN 'normal'
  WHEN NOW() > sla_deadline AND first_action_at IS NULL THEN 'breached'
  WHEN NOW() > sla_deadline - INTERVAL '2 hours' AND first_action_at IS NULL THEN 'warning'
  ELSE 'normal'
END;

-- 2. Tabla reassignment_log
CREATE TABLE IF NOT EXISTS reassignment_log (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id INTEGER NOT NULL REFERENCES users(id),
  reason VARCHAR(50) NOT NULL DEFAULT 'sla_breach',
  reassigned_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reassign_ticket ON reassignment_log(ticket_id);
CREATE INDEX IF NOT EXISTS idx_reassign_date ON reassignment_log(created_at);

-- 3. Tabla reminders
CREATE TABLE IF NOT EXISTS reminders (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  due_date DATE NOT NULL,
  due_time TIME,
  priority VARCHAR(10) DEFAULT 'alta',
  status VARCHAR(15) DEFAULT 'pending',
  reminder_type VARCHAR(20) NOT NULL DEFAULT 'follow_up',
  created_by INTEGER NOT NULL REFERENCES users(id),
  assigned_to INTEGER NOT NULL REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reminder_user ON reminders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_reminder_date ON reminders(due_date);
CREATE INDEX IF NOT EXISTS idx_reminder_ticket ON reminders(ticket_id);
CREATE INDEX IF NOT EXISTS idx_reminder_status ON reminders(status);

-- 4. Tabla notifications
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT,
  link_type VARCHAR(20),
  link_id INTEGER,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_date ON notifications(created_at);
