-- Migration 059: invoices.model_id → catálogo
-- Motivo: alinear con el resto del CRM (tickets.model_id, sales_notes.model_id,
-- supplier_payments.model_id) que resuelve la foto del catálogo por FK directo.
-- El LATERAL JOIN por texto es frágil cuando el modelo del PDF no coincide
-- exactamente con el del catálogo; con FK directo la foto SIEMPRE sale si
-- el sync resolvió el modelo correctamente.
--
-- No destructivo: ADD COLUMN IF NOT EXISTS, FK ON DELETE SET NULL.
-- Backfill con (1) match por inventory.model_id → (2) sale_note.model_id →
-- (3) match canónico marca+modelo sobre moto_models (mismo patrón que 050).

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES moto_models(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS invoices_model_id_idx ON invoices(model_id);

-- Backfill 1: heredar model_id desde el inventory al que ya apunta la factura.
UPDATE invoices i
   SET model_id = inv.model_id
  FROM inventory inv
 WHERE i.inventory_id = inv.id
   AND i.model_id IS NULL
   AND inv.model_id IS NOT NULL;

-- Backfill 2: heredar model_id desde la nota de venta vinculada.
UPDATE invoices i
   SET model_id = sn.model_id
  FROM sales_notes sn
 WHERE i.sale_note_id = sn.id
   AND i.model_id IS NULL
   AND sn.model_id IS NOT NULL;

-- Backfill 3: match canónico por marca+modelo sobre moto_models.
-- Normaliza (UPPER + sin espacios/guiones/puntos) — mismo patrón que 050 para
-- sales_notes. Preferimos el año exacto; si no, el más nuevo activo.
UPDATE invoices i
   SET model_id = mm.id
  FROM (
    SELECT DISTINCT ON (id_key) id, id_key
    FROM (
      SELECT
        i2.id AS id_key,
        mm2.id,
        CASE WHEN mm2.year = i2.commercial_year THEN 0 ELSE 1 END AS yr_prio,
        mm2.active,
        mm2.year
      FROM invoices i2
      JOIN moto_models mm2
        ON UPPER(REGEXP_REPLACE(mm2.brand, '[\s\-\.]', '', 'g'))
         = UPPER(REGEXP_REPLACE(i2.brand, '[\s\-\.]', '', 'g'))
       AND UPPER(REGEXP_REPLACE(mm2.model, '[\s\-\.]', '', 'g'))
         = UPPER(REGEXP_REPLACE(i2.model, '[\s\-\.]', '', 'g'))
      WHERE i2.model_id IS NULL
        AND i2.brand IS NOT NULL
        AND i2.model IS NOT NULL
      ORDER BY i2.id, yr_prio ASC, mm2.active DESC, mm2.year DESC
    ) s
    ORDER BY id_key, yr_prio ASC, active DESC, year DESC
  ) mm
 WHERE i.id = mm.id_key
   AND i.model_id IS NULL;
