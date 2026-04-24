-- 061 — Múltiples abonos por reserva con medio de pago distinto.
-- Caso real: el cliente abona $200.000 por transferencia y $1.000.000 en
-- efectivo. Antes sólo podíamos guardar un solo medio de pago + un total
-- en invoice_amount, perdiendo el desglose.
--
-- abono_lines = JSONB array de {method, amount, [date]}
-- invoice_amount sigue siendo la suma (compatibilidad con código viejo).

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS abono_lines JSONB;

ALTER TABLE sales_notes
  ADD COLUMN IF NOT EXISTS abono_lines JSONB;
