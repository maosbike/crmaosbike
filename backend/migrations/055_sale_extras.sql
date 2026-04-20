-- Migration 055: desglose de extras en ventas
-- Guarda accesorios, tipo de cobro (inscripción/documentación completa), monto del cobro
-- y descuento tanto en sales_notes como en inventory.

ALTER TABLE sales_notes
  ADD COLUMN IF NOT EXISTS accessories  JSONB,
  ADD COLUMN IF NOT EXISTS charge_type  TEXT,
  ADD COLUMN IF NOT EXISTS charge_amt   INTEGER,
  ADD COLUMN IF NOT EXISTS discount_amt INTEGER;

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS accessories  JSONB,
  ADD COLUMN IF NOT EXISTS charge_type  TEXT,
  ADD COLUMN IF NOT EXISTS charge_amt   INTEGER,
  ADD COLUMN IF NOT EXISTS discount_amt INTEGER;
