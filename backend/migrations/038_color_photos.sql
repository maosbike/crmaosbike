-- Fotos por color en moto_models
-- Estructura: [{ "color": "Rojo", "url": "https://..." }, ...]
ALTER TABLE moto_models ADD COLUMN IF NOT EXISTS color_photos JSONB DEFAULT '[]';
