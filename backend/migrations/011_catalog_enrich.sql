-- Migration 011: Enriquecer catálogo con descripción, ficha técnica e imagen gallery

ALTER TABLE moto_models
  ADD COLUMN IF NOT EXISTS description   TEXT,
  ADD COLUMN IF NOT EXISTS spec_url      VARCHAR(500),
  ADD COLUMN IF NOT EXISTS image_gallery JSONB DEFAULT '[]';
