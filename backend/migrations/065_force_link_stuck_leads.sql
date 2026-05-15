-- 065_force_link_stuck_leads.sql
-- Repara los leads importados que quedaron con model_id NULL porque el
-- matcher viejo no reconoció "Royal Enfield Himalayan 450" ni "Suzuki HAYABUSA".
-- Ejecuta en orden:
--   1) Crea Suzuki Hayabusa en el catálogo si falta.
--   2) Crea Royal Enfield Himalayan 450 en el catálogo si falta.
--   3) UPDATE tickets sin model_id cuya nota inicial menciona el modelo.
--   4) Inserta una nota en timeline por cada ticket reparado para trazabilidad.

BEGIN;

-- (1) Asegurar que Suzuki Hayabusa exista en el catálogo.
--     year y price son NOT NULL: usamos año actual y price=0 (admin lo
--     completa al editar el modelo en Catálogo).
INSERT INTO moto_models (brand, model, year, price, active, created_at, updated_at)
SELECT 'Suzuki', 'Hayabusa', EXTRACT(YEAR FROM NOW())::INT, 0, true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM moto_models
   WHERE brand ILIKE 'suzuki'
     AND (model ILIKE '%hayabusa%' OR commercial_name ILIKE '%hayabusa%')
);

-- (2) Asegurar que Royal Enfield Himalayan 450 exista en el catálogo.
INSERT INTO moto_models (brand, model, year, price, active, created_at, updated_at)
SELECT 'Royal Enfield', 'Himalayan 450', EXTRACT(YEAR FROM NOW())::INT, 0, true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM moto_models
   WHERE brand ILIKE 'royal enfield'
     AND (model ILIKE '%himalayan%' OR commercial_name ILIKE '%himalayan%')
);

-- (3a) Vincular tickets de Himalayan 450 cuya nota inicial los identifica.
WITH himalayan AS (
  SELECT id FROM moto_models
   WHERE brand ILIKE 'royal enfield'
     AND (model ILIKE '%himalayan%' OR commercial_name ILIKE '%himalayan%')
   ORDER BY (model ILIKE '%450%') DESC, created_at ASC
   LIMIT 1
),
targets AS (
  SELECT t.id AS ticket_id
    FROM tickets t
   WHERE t.model_id IS NULL
     AND EXISTS (
       SELECT 1 FROM timeline tl
        WHERE tl.ticket_id = t.id
          AND tl.type = 'system'
          AND tl.note ILIKE '%himalayan%'
     )
)
UPDATE tickets t
   SET model_id = (SELECT id FROM himalayan),
       updated_at = NOW()
  FROM targets
 WHERE t.id = targets.ticket_id
   AND (SELECT id FROM himalayan) IS NOT NULL;

-- (3b) Vincular tickets de Hayabusa.
WITH hayabusa AS (
  SELECT id FROM moto_models
   WHERE brand ILIKE 'suzuki'
     AND (model ILIKE '%hayabusa%' OR commercial_name ILIKE '%hayabusa%')
   ORDER BY created_at ASC
   LIMIT 1
),
targets AS (
  SELECT t.id AS ticket_id
    FROM tickets t
   WHERE t.model_id IS NULL
     AND EXISTS (
       SELECT 1 FROM timeline tl
        WHERE tl.ticket_id = t.id
          AND tl.type = 'system'
          AND tl.note ILIKE '%hayabusa%'
     )
)
UPDATE tickets t
   SET model_id = (SELECT id FROM hayabusa),
       updated_at = NOW()
  FROM targets
 WHERE t.id = targets.ticket_id
   AND (SELECT id FROM hayabusa) IS NOT NULL;

-- (4) Notar en timeline cada ticket que tocamos en este paso.
INSERT INTO timeline (ticket_id, user_id, type, title, note)
SELECT t.id, NULL, 'system', 'Modelo asignado por migración 065',
       'Vinculación retroactiva: ' || mm.brand || ' ' || mm.model
  FROM tickets t
  JOIN moto_models mm ON mm.id = t.model_id
 WHERE t.updated_at >= NOW() - INTERVAL '1 minute'
   AND (mm.model ILIKE '%himalayan%' OR mm.model ILIKE '%hayabusa%')
   AND NOT EXISTS (
     SELECT 1 FROM timeline tl2
      WHERE tl2.ticket_id = t.id
        AND tl2.title = 'Modelo asignado por migración 065'
   );

COMMIT;
