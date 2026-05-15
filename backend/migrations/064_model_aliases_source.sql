-- 064_model_aliases_source.sql
-- Trackeamos de dónde vino cada alias: 'manual' (admin lo creó),
-- 'claude' (el matcher LLM lo dedujo), 'import' (legacy de imports).
-- Permite auditar si Claude está creando aliases raros que deban revisarse.
ALTER TABLE model_aliases
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
