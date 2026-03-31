-- Agregar campos de evidencia a la tabla timeline
ALTER TABLE timeline ADD COLUMN IF NOT EXISTS evidence_url  TEXT;
ALTER TABLE timeline ADD COLUMN IF NOT EXISTS evidence_type VARCHAR(30);
