-- Migration 020: inventory_history — audit log por unidad de inventario
CREATE TABLE IF NOT EXISTS inventory_history (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  event_type   VARCHAR(40) NOT NULL,  -- created|imported|sold|status_changed|moved|note
  from_status  VARCHAR(20),
  to_status    VARCHAR(20),
  user_id      UUID REFERENCES users(id),
  note         TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_history_unit ON inventory_history(inventory_id, created_at DESC);

-- Poblar historial de creación para unidades existentes que no tienen registro
INSERT INTO inventory_history (inventory_id, event_type, to_status, user_id, note, created_at)
SELECT id, 'created', status, created_by,
       CASE WHEN added_as_sold THEN 'Unidad creada manualmente y registrada como vendida'
            ELSE 'Unidad creada manualmente' END,
       created_at
FROM inventory
WHERE id NOT IN (SELECT DISTINCT inventory_id FROM inventory_history)
ON CONFLICT DO NOTHING;
