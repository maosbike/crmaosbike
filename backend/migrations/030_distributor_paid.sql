-- Migration 030: Estado de pago al distribuidor
-- Indica si la unidad vendida ya fue pagada por MaosBike al distribuidor.
-- NO representa el pago del cliente a MaosBike.
-- Valor por defecto false = pendiente de pago al distribuidor.
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS distributor_paid BOOLEAN DEFAULT false;
