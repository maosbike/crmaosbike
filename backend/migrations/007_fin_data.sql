-- Columna fin_data JSONB para guardar datos financieros extendidos de plantillas externas
-- (evaluaciones Tanner / Autofin, opción de compra, modelo de interés, etc.)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS fin_data JSONB DEFAULT '{}';
