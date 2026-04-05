-- Migración 033: Fix retroactivo de first_action_at / last_real_action_at
--
-- Por qué quedó incompleta la 032:
--   La 032 puso status = 'en_gestion' para leads con contacto/evidencia, pero
--   el cron de SLA y la lógica de reasignación automática NO miran el campo status:
--   miran `first_action_at IS NULL` para decidir si un lead fue realmente gestionado.
--   Un lead con status 'en_gestion' pero first_action_at = NULL sigue siendo
--   candidato a sla_status = 'warning' → 'breached' → reasignación automática.
--
-- Esta migración toma, para cada ticket que tenga entradas de contacto o evidencia
-- en el timeline, la marca de tiempo más temprana como first_action_at y la más
-- reciente como last_real_action_at. Usa COALESCE / GREATEST para no pisar valores
-- ya correctos (no destructivo).

UPDATE tickets t
SET
  first_action_at     = COALESCE(t.first_action_at, sub.earliest),
  last_real_action_at = GREATEST(t.last_real_action_at, sub.latest)
FROM (
  SELECT
    ticket_id,
    MIN(created_at) AS earliest,
    MAX(created_at) AS latest
  FROM timeline
  WHERE type IN ('contact_registered', 'contact_evidence')
  GROUP BY ticket_id
) sub
WHERE t.id = sub.ticket_id
  AND (
    t.first_action_at IS NULL
    OR t.last_real_action_at IS NULL
    OR t.last_real_action_at < sub.latest
  );
