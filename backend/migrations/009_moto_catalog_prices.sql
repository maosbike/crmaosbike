-- Migration 009: Catálogo maestro de modelos + precios por período

-- Enriquecer moto_models como catálogo maestro
ALTER TABLE moto_models
  ADD COLUMN IF NOT EXISTS normalized_model VARCHAR(120),
  ADD COLUMN IF NOT EXISTS commercial_name  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS code             VARCHAR(30),
  ADD COLUMN IF NOT EXISTS segment          VARCHAR(60),
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW();

-- Poblar campos nuevos en registros existentes
UPDATE moto_models
SET
  commercial_name  = COALESCE(commercial_name, model),
  normalized_model = COALESCE(
    normalized_model,
    lower(trim(regexp_replace(regexp_replace(model, '\(.*?\)', '', 'g'), '\s+', ' ', 'g')))
  )
WHERE commercial_name IS NULL OR normalized_model IS NULL;

-- Índices para búsqueda
CREATE INDEX IF NOT EXISTS idx_moto_models_normalized ON moto_models(normalized_model);
CREATE INDEX IF NOT EXISTS idx_moto_models_brand      ON moto_models(brand);
CREATE INDEX IF NOT EXISTS idx_moto_models_code       ON moto_models(code);

-- Precios por período
CREATE TABLE IF NOT EXISTS moto_prices (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id             UUID NOT NULL REFERENCES moto_models(id) ON DELETE CASCADE,
  period               VARCHAR(7)   NOT NULL,   -- '2026-03'
  price_list           INTEGER,                 -- precio sin bono
  bono_todo_medio      INTEGER,                 -- bono cualquier medio de pago
  price_todo_medio     INTEGER,                 -- precio final con bono TMP
  bono_financiamiento  INTEGER,                 -- bono exclusivo Autofin
  price_financiamiento INTEGER,                 -- precio final con Autofin
  dcto_30_dias         VARCHAR(10),             -- descuento 30 días (MMB)
  dcto_60_dias         VARCHAR(10),             -- descuento 60 días (MMB)
  source_file          VARCHAR(255),
  source_type          VARCHAR(30),             -- honda | yamaha | mmb | promobility
  raw_row              JSONB,                   -- fila original para auditoría
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_id, period)
);

CREATE INDEX IF NOT EXISTS idx_moto_prices_period ON moto_prices(period);
CREATE INDEX IF NOT EXISTS idx_moto_prices_model  ON moto_prices(model_id);

-- Logs de importación de listas de precios
CREATE TABLE IF NOT EXISTS price_import_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  imported_by  UUID REFERENCES users(id),
  filename     VARCHAR(255),
  period       VARCHAR(7),
  source_type  VARCHAR(30),
  total_rows   INTEGER DEFAULT 0,
  imported     INTEGER DEFAULT 0,
  updated      INTEGER DEFAULT 0,
  new_models   INTEGER DEFAULT 0,
  ambiguous    INTEGER DEFAULT 0,
  errors       INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
