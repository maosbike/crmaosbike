-- Migration 028: Orden manual de inventario (sort_order)
-- NO DESTRUCTIVO: ADD COLUMN con DEFAULT, inicializa por fecha de creación

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Inicializar sort_order por fecha de creación (más reciente = número menor)
-- Para unidades que aún estén en 0 (evita sobreescribir si se aplica varias veces)
UPDATE inventory
SET sort_order = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM inventory
  WHERE sort_order = 0
) sub
WHERE inventory.id = sub.id;

CREATE INDEX IF NOT EXISTS idx_inventory_sort_order ON inventory(sort_order);
