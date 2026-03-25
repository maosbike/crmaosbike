-- 017_model_aliases.sql
-- Tabla de aliases para mapear nombres alternativos de motos al catálogo
CREATE TABLE IF NOT EXISTS model_aliases (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias      TEXT NOT NULL,           -- nombre como viene en leads/excel: "R15 V4", "NEW R3"
  model_id   UUID NOT NULL REFERENCES moto_models(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alias)
);
CREATE INDEX IF NOT EXISTS idx_model_aliases_alias ON model_aliases(lower(alias));
