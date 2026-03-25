-- Migration 018: Restore ticket assignments lost by seed running on every deploy.
-- Re-asigna tickets con assigned_to NULL al vendedor activo de la misma sucursal.
-- Solo actúa si hay tickets sin asignar; no toca tickets que ya tienen asignación.

UPDATE tickets t
SET assigned_to = (
  SELECT u.id
  FROM users u
  WHERE u.branch_id = t.branch_id
    AND u.role = 'vendedor'
    AND u.active = true
  ORDER BY u.created_at ASC  -- el primer vendedor de la sucursal
  LIMIT 1
)
WHERE t.assigned_to IS NULL
  AND t.branch_id IS NOT NULL
  AND t.status NOT IN ('ganado', 'perdido', 'cerrado');

-- También sincroniza seller_id = assigned_to donde seller_id quedó NULL
UPDATE tickets
SET seller_id = assigned_to
WHERE seller_id IS NULL
  AND assigned_to IS NOT NULL;
