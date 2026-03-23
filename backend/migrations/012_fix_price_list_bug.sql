-- ============================================================
-- 012_fix_price_list_bug.sql
--
-- Corrige datos mal cargados por el bug en pricelist.js donde
-- moto_models.price se guardaba como price_todo_medio en lugar
-- de price_list.
--
-- Para cada modelo, toma el período más reciente en moto_prices
-- y corrige moto_models.price = price_list y bonus = bono_todo_medio.
--
-- También detecta y limpia casos donde el bonus >= price
-- (síntoma claro del bug: el bono fue guardado como price_list).
-- ============================================================

BEGIN;

-- 1. Corregir moto_models.price usando el price_list real de moto_prices
--    Solo actualiza si moto_prices tiene un price_list válido.
UPDATE moto_models mm
SET
  price      = mp.price_list,
  bonus      = COALESCE(mp.bono_todo_medio, 0),
  updated_at = NOW()
FROM moto_prices mp
WHERE mp.model_id = mm.id
  AND mp.period = (
    SELECT MAX(mp2.period)
    FROM moto_prices mp2
    WHERE mp2.model_id = mm.id
      AND mp2.price_list IS NOT NULL
      AND mp2.price_list > 0
  )
  AND mp.price_list IS NOT NULL
  AND mp.price_list > 0
  -- Solo actualizar si el precio actual no coincide con price_list
  -- (evita tocar modelos que ya estaban bien)
  AND mm.price != mp.price_list;

-- 2. Para modelos donde bonus >= price (dato claramente corrupto),
--    limpiar el precio para que no se muestre en el catálogo.
--    Es preferible mostrar sin precio que mostrar precio incorrecto.
UPDATE moto_models
SET
  price      = 0,
  bonus      = 0,
  updated_at = NOW()
WHERE bonus > 0
  AND bonus >= price;

-- 3. Reportar cuántos modelos fueron afectados (para el log)
DO $$
DECLARE
  fixed_count INTEGER;
  cleared_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO fixed_count
  FROM moto_models mm
  JOIN moto_prices mp ON mp.model_id = mm.id
  WHERE mp.price_list IS NOT NULL AND mp.price_list > 0
    AND mm.price = mp.price_list;

  RAISE NOTICE 'Migración 012: modelos con precio corregido desde moto_prices: %', fixed_count;
END $$;

COMMIT;
