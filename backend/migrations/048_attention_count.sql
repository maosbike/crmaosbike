-- Migration 048: Contador de reincidencias de needs_attention por lead
--
-- Motivo: el sistema activa needs_attention cuando un lead lleva >48h sin acción
-- real (checkStagnantLeads) o tiene un followup vencido (checkExpiredFollowups).
-- Sin un contador acumulativo no hay forma de detectar leads cronicamente
-- desatendidos para escalarlos al supervisor de la sucursal.
--
-- attention_count: cuántas veces se activó needs_attention en este lead.
-- No se resetea al registrar una acción — es un acumulador histórico.
-- Se incrementa en cada UPDATE que activa needs_attention = TRUE.
--
-- No destructivo: ADD COLUMN IF NOT EXISTS, DEFAULT 0, no toca datos existentes.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS attention_count INTEGER NOT NULL DEFAULT 0;

-- Índice parcial para la query de checkEscalations():
-- busca leads activos con attention_count alto sin escanear terminales.
CREATE INDEX IF NOT EXISTS tickets_attention_count_idx
  ON tickets(attention_count, branch_id)
  WHERE status NOT IN ('ganado', 'perdido');
