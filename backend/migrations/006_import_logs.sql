-- ================================================
-- MIGRACIÓN 006: Tabla de log de importaciones masivas
-- ================================================

CREATE TABLE IF NOT EXISTS import_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  imported_by UUID NOT NULL REFERENCES users(id),
  filename VARCHAR(255),
  total_rows INTEGER DEFAULT 0,
  imported INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  duplicates INTEGER DEFAULT 0,
  no_seller INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_logs_user ON import_logs(imported_by);
CREATE INDEX IF NOT EXISTS idx_import_logs_date ON import_logs(created_at);
