-- 014_price_staging.sql
-- Tablas para el nuevo flujo de importación con staging y aprobación explícita.
CREATE TABLE IF NOT EXISTS price_staging_batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename    VARCHAR(255),
  uploaded_by UUID,
  total_rows  INTEGER DEFAULT 0,
  status      VARCHAR(20) DEFAULT 'pending',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_staging (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         UUID NOT NULL REFERENCES price_staging_batches(id) ON DELETE CASCADE,
  row_number       INTEGER,
  brand            VARCHAR(100),
  model            VARCHAR(200),
  commercial_name  VARCHAR(200),
  category         VARCHAR(100),
  cc               INTEGER,
  year             INTEGER,
  price_list       INTEGER,
  bonus            INTEGER,
  description      TEXT,
  status           VARCHAR(20) DEFAULT 'pending',
  model_id         UUID,
  match_type       VARCHAR(20),
  validation_errors JSONB DEFAULT '[]'::jsonb,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
