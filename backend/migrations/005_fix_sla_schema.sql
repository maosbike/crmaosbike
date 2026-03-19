-- ================================================
-- MIGRACIÓN 005: Corrección de esquema SLA
-- Fixes:
--   1. Agrega columna assigned_to a tickets (faltaba en 002)
--   2. Recrea reassignment_log, reminders, notifications con UUID (002 usaba INTEGER)
--   3. Agrega columnas SLA a tickets si no existen (002 puede no haberse ejecutado)
--   4. Inicializa sla_deadline y assigned_to para tickets existentes
-- ================================================

-- 1. Columnas SLA en tickets (idempotente)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_deadline TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS first_action_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sla_status VARCHAR(20) DEFAULT 'normal';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reassignment_count INTEGER DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS last_real_action_at TIMESTAMPTZ;

-- Inicializar assigned_to = seller_id para tickets existentes sin asignar
UPDATE tickets SET assigned_to = seller_id
  WHERE assigned_to IS NULL AND seller_id IS NOT NULL;

-- Calcular sla_deadline para tickets sin deadline (8h desde creación)
UPDATE tickets SET sla_deadline = created_at + INTERVAL '8 hours'
  WHERE sla_deadline IS NULL;

-- Actualizar sla_status inicial
UPDATE tickets SET sla_status = CASE
  WHEN status IN ('ganado','perdido','cerrado') THEN 'normal'
  WHEN NOW() > sla_deadline AND first_action_at IS NULL THEN 'breached'
  WHEN NOW() > sla_deadline - INTERVAL '2 hours' AND first_action_at IS NULL THEN 'warning'
  ELSE 'normal'
END
WHERE sla_status IS NULL OR sla_status = 'normal';

-- Índice para assigned_to
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_to);

-- 2. Tabla reassignment_log con UUID (reemplaza versión con INTEGER de 002)
-- Las tablas creadas con INTEGER FK fallan al referenciar UUID, así que se recrean.
DROP TABLE IF EXISTS reassignment_log CASCADE;
CREATE TABLE reassignment_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  from_user_id UUID REFERENCES users(id),
  to_user_id UUID NOT NULL REFERENCES users(id),
  reason VARCHAR(50) NOT NULL DEFAULT 'sla_breach',
  reassigned_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reassign_ticket ON reassignment_log(ticket_id);
CREATE INDEX IF NOT EXISTS idx_reassign_date ON reassignment_log(created_at);

-- 3. Tabla reminders con UUID
DROP TABLE IF EXISTS reminders CASCADE;
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  due_date DATE NOT NULL,
  due_time TIME,
  priority VARCHAR(10) DEFAULT 'alta',
  status VARCHAR(15) DEFAULT 'pending',
  reminder_type VARCHAR(20) NOT NULL DEFAULT 'follow_up',
  created_by UUID NOT NULL REFERENCES users(id),
  assigned_to UUID NOT NULL REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reminder_user ON reminders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_reminder_date ON reminders(due_date);
CREATE INDEX IF NOT EXISTS idx_reminder_ticket ON reminders(ticket_id);
CREATE INDEX IF NOT EXISTS idx_reminder_status ON reminders(status);

-- 4. Tabla notifications con UUID
DROP TABLE IF EXISTS notifications CASCADE;
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT,
  link_type VARCHAR(20),
  link_id UUID,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_date ON notifications(created_at);
