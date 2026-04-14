-- Migration 046: Seguimiento obligatorio de leads + flag "Necesita atención"
-- Agrega columnas a tickets para el ciclo de 48h en estados en_gestion/cotizado/financiamiento.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS needs_attention       BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS needs_attention_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_followup_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_status       TEXT,
  ADD COLUMN IF NOT EXISTS followup_note         TEXT,
  ADD COLUMN IF NOT EXISTS followup_next_step    TEXT,
  ADD COLUMN IF NOT EXISTS followup_updated_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS tickets_needs_attention_idx
  ON tickets(needs_attention) WHERE needs_attention = TRUE;
CREATE INDEX IF NOT EXISTS tickets_next_followup_idx
  ON tickets(next_followup_at) WHERE next_followup_at IS NOT NULL;
