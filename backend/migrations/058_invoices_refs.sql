-- 058 — Facturas emitidas: soporte para notas de crédito y referencias cruzadas.
-- Motivación: el emisor Maosbike emite FACTURA y NOTA DE CRÉDITO (anulaciones).
-- Las notas de crédito tienen un campo "ANULA DOCUMENTO DE LA REFERENCIA —
-- Fact.Electronica N° XXXX" que apunta al folio original. Hay que capturarlo
-- para poder mostrar la cadena de anulaciones en la UI.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS ref_folio      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS ref_rut_emisor VARCHAR(20),
  ADD COLUMN IF NOT EXISTS ref_fecha      DATE,
  ADD COLUMN IF NOT EXISTS anulada_por_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_ref_folio   ON invoices(ref_folio);
CREATE INDEX IF NOT EXISTS idx_invoices_anulada_por ON invoices(anulada_por_id);
