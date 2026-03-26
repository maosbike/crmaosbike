-- Migration 019: Add sale fields to inventory for "add as already sold" flow
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS sold_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sold_by       UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS ticket_id     UUID REFERENCES tickets(id),
  ADD COLUMN IF NOT EXISTS sale_notes    TEXT,
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
  ADD COLUMN IF NOT EXISTS sale_type     VARCHAR(20),   -- 'inscripcion' | 'completa'
  ADD COLUMN IF NOT EXISTS added_as_sold BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by    UUID REFERENCES users(id);
