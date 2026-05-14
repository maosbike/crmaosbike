-- 063_lead_lost_reason.sql
-- Motivo obligatorio al cerrar un lead como "Perdido".
-- El admin necesita estos datos para reportar a Yamaha cuáles leads se
-- perdieron y por qué. Antes el estado 'perdido' no exigía ninguna
-- explicación, así que la info se perdía.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS lost_reason        TEXT,
  ADD COLUMN IF NOT EXISTS lost_reason_detail TEXT,
  ADD COLUMN IF NOT EXISTS lost_at            TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS tickets_lost_reason_idx
  ON tickets(lost_reason) WHERE lost_reason IS NOT NULL;
CREATE INDEX IF NOT EXISTS tickets_lost_at_idx
  ON tickets(lost_at DESC) WHERE lost_at IS NOT NULL;
