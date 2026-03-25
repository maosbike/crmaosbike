-- ════════════════════════════════════════════════════════
-- Migración 016: Índices de performance + Soft Delete
-- ════════════════════════════════════════════════════════

-- Índices faltantes para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_deadline ON tickets(sla_deadline) WHERE status NOT IN ('ganado','perdido','cerrado');
CREATE INDEX IF NOT EXISTS idx_reminders_due_date ON reminders(due_date) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_status ON tickets(sla_status) WHERE status NOT IN ('ganado','perdido','cerrado');
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_status ON tickets(assigned_to, status);

-- Soft delete en tickets
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_deleted_at ON tickets(deleted_at) WHERE deleted_at IS NULL;

-- Vista que excluye tickets borrados (retrocompatible)
CREATE OR REPLACE VIEW active_tickets AS
  SELECT * FROM tickets WHERE deleted_at IS NULL;
