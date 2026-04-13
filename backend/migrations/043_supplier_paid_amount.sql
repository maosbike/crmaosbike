-- 043 — Monto pagado real (puede diferir del total de factura)
ALTER TABLE supplier_payments
  ADD COLUMN IF NOT EXISTS paid_amount BIGINT;
