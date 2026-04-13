-- 042 — Campos adicionales para supplier_payments
ALTER TABLE supplier_payments
  ADD COLUMN IF NOT EXISTS neto           BIGINT,
  ADD COLUMN IF NOT EXISTS iva            BIGINT,
  ADD COLUMN IF NOT EXISTS banco          VARCHAR(200),
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(100);
