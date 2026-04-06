-- 034: Introduce status 'nuevo' como estado inicial de leads
--
-- 'nuevo'   = lead recién creado, nadie lo ha abierto aún
-- 'abierto' = alguien lo revisó pero sin gestión real
--
-- Cambios:
--   1. El DEFAULT de la columna pasa de 'abierto' a 'nuevo'
--   2. Los leads existentes con status='abierto' Y sin actividad en timeline
--      (nunca contactados, creados hace menos de 7 días) se reclasifican a 'nuevo'
--      para reflejar la nueva semántica. El resto queda como está.

-- 1. Cambiar el DEFAULT de la columna
ALTER TABLE tickets ALTER COLUMN status SET DEFAULT 'nuevo';

-- 2. Reclasificar leads 'abierto' que nunca tuvieron actividad real y son recientes
--    (< 7 días), interpretándolos como verdaderamente "nuevos sin abrir"
UPDATE tickets
SET status = 'nuevo'
WHERE status = 'abierto'
  AND first_action_at IS NULL
  AND created_at > NOW() - INTERVAL '7 days'
  AND id NOT IN (
    SELECT DISTINCT ticket_id FROM timeline
    WHERE type IN ('contact_registered','contact_evidence','note_added',
                   'reminder_created','financing_updated','test_ride_done')
  );
