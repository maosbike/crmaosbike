-- Migration 050: sales_notes.model_id → catálogo
-- Motivo: permitir mostrar la foto del catálogo (moto_models.image_url) junto a cada
-- nota comercial, y asociar cada venta/reserva a su modelo canónico.
--
-- No destructivo: ADD COLUMN IF NOT EXISTS, FK ON DELETE SET NULL.
-- Backfill usa match canónico (upper + sin espacios/guiones/puntos) sobre marca+modelo.

ALTER TABLE sales_notes
  ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES moto_models(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_notes_model_idx ON sales_notes(model_id);

-- Backfill: para cada sales_note sin model_id, buscamos el moto_models que coincida
-- por marca canónica y nombre de modelo canónico. Preferimos el de mismo año; si no
-- hay, tomamos cualquier activo.
UPDATE sales_notes n
SET model_id = mm.id
FROM (
  SELECT DISTINCT ON (id_key) id, id_key
  FROM (
    SELECT
      n2.id AS id_key,
      mm2.id,
      CASE WHEN mm2.year = n2.year THEN 0 ELSE 1 END AS yr_prio,
      mm2.active
    FROM sales_notes n2
    JOIN moto_models mm2
      ON UPPER(REGEXP_REPLACE(mm2.brand, '[\s\-\.]', '', 'g'))
       = UPPER(REGEXP_REPLACE(n2.brand, '[\s\-\.]', '', 'g'))
     AND UPPER(REGEXP_REPLACE(mm2.model, '[\s\-\.]', '', 'g'))
       = UPPER(REGEXP_REPLACE(n2.model, '[\s\-\.]', '', 'g'))
    WHERE n2.model_id IS NULL
    ORDER BY n2.id, yr_prio ASC, mm2.active DESC
  ) s
  ORDER BY id_key, yr_prio ASC, active DESC
) mm
WHERE n.id = mm.id_key
  AND n.model_id IS NULL;
