-- 062_strip_brand_prefix.sql
-- Limpieza retroactiva de modelos con la marca duplicada al inicio del
-- nombre. Bug introducido cuando el parser Claude empezó a devolver
-- model="Yamaha MT-09" en vez de "MT-09" — la card lo renderiza como
-- "${brand} ${commercial_name||model}" y queda "Yamaha Yamaha MT-09".
--
-- Esta migración:
--   1) Quita el prefijo de marca de moto_models.model
--   2) Quita el prefijo de marca de moto_models.commercial_name
--   3) Recalcula normalized_model con las mismas reglas que el código JS
--      (utils/pdfExtractor.js: normalizeModel) para que el match futuro
--      no se rompa.
--
-- Idempotente: si el prefijo no está, el regex no hace nada.

BEGIN;

-- (1) Strip del prefijo "<brand> " (case-insensitive) en model y
--     commercial_name. Usa regexp_replace con la marca real de cada fila.
UPDATE moto_models
   SET model = REGEXP_REPLACE(model, '^' || brand || '\s+', '', 'i'),
       updated_at = NOW()
 WHERE brand IS NOT NULL
   AND model ~* ('^' || brand || '\s+');

UPDATE moto_models
   SET commercial_name = REGEXP_REPLACE(commercial_name, '^' || brand || '\s+', '', 'i'),
       updated_at = NOW()
 WHERE brand IS NOT NULL
   AND commercial_name IS NOT NULL
   AND commercial_name ~* ('^' || brand || '\s+');

-- (2) Casos especiales: marcas con espacios o palabras compuestas.
--     "Royal Enfield" puede aparecer como "ROYAL ENFIELD" o "Royal-Enfield".
--     El paso (1) ya lo cubre porque el brand está como "Royal Enfield"
--     en la columna, pero también puede haber rastros con guión.
UPDATE moto_models
   SET model = REGEXP_REPLACE(model, '^Royal[\s\-]Enfield\s+', '', 'i'),
       updated_at = NOW()
 WHERE brand ILIKE 'royal enfield'
   AND model ~* '^Royal[\s\-]Enfield\s+';

UPDATE moto_models
   SET commercial_name = REGEXP_REPLACE(commercial_name, '^Royal[\s\-]Enfield\s+', '', 'i'),
       updated_at = NOW()
 WHERE brand ILIKE 'royal enfield'
   AND commercial_name IS NOT NULL
   AND commercial_name ~* '^Royal[\s\-]Enfield\s+';

-- (3) Recalcular normalized_model con la lógica de normalizeModel().
--     Pasos: lowercase → quitar "new " inicial → quitar paréntesis →
--     quitar años → solo alfanumérico/espacios/guiones → colapsar espacios.
UPDATE moto_models
   SET normalized_model = TRIM(REGEXP_REPLACE(
     REGEXP_REPLACE(
       REGEXP_REPLACE(
         REGEXP_REPLACE(
           REGEXP_REPLACE(LOWER(model), '^new\s+', '', 'g'),
         '\(.*?\)', '', 'g'),
       '\m20\d{2}\M', '', 'g'),
     '[^a-z0-9\s\-]', ' ', 'g'),
   '\s+', ' ', 'g')),
   updated_at = NOW()
 WHERE model IS NOT NULL;

-- (4) Limpiar también prefijo "new" residual en commercial_name (cosmético).
UPDATE moto_models
   SET commercial_name = REGEXP_REPLACE(commercial_name, '^new\s+', '', 'i'),
       updated_at = NOW()
 WHERE commercial_name ~* '^new\s+';

COMMIT;
