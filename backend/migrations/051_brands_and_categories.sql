-- Migration 051: brands + brand_categories
-- Motivo: permitir logo y metadata por marca, y categorías agrupadas por marca
-- para filtros más claros en el catálogo.
--
-- No destructivo: el campo moto_models.brand (string) se mantiene como fuente
-- de verdad. La tabla brands sólo agrega logo y sort_order indexados por name.

CREATE TABLE IF NOT EXISTS brands (
  name       TEXT PRIMARY KEY,
  logo_url   TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Poblar desde marcas existentes en moto_models
INSERT INTO brands (name)
  SELECT DISTINCT brand FROM moto_models
  WHERE brand IS NOT NULL AND brand <> ''
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS brand_categories (
  id         SERIAL PRIMARY KEY,
  brand      TEXT NOT NULL,
  name       TEXT NOT NULL,
  sort_order INT  DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(brand, name)
);

CREATE INDEX IF NOT EXISTS brand_categories_brand_idx ON brand_categories(brand);

-- Backfill: para cada combinación (brand, category) existente en moto_models,
-- crear la entrada en brand_categories.
INSERT INTO brand_categories (brand, name)
  SELECT DISTINCT brand, category
  FROM moto_models
  WHERE brand IS NOT NULL AND category IS NOT NULL
    AND brand <> '' AND category <> ''
ON CONFLICT (brand, name) DO NOTHING;
