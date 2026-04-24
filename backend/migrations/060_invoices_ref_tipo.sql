-- 060 — Facturas: tipo de referencia de la nota de crédito.
-- Las NC chilenas pueden ser:
--   · anulacion  — cancela la factura de referencia (amounts != 0).
--   · correccion — corrige datos de receptor/texto (amounts = 0, texto
--                   "Corrige Dato Receptor" o similar).
--   · ajuste     — corrige montos (partial refund / rebaja).
-- Antes este backend trataba TODA NC como anulación, dejando la factura
-- original marcada como anulada_por_id aunque la venta siguiera vigente.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS ref_tipo VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_invoices_ref_tipo ON invoices(ref_tipo);
