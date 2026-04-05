-- Migración 032: Fix retroactivo de leads con evidencia/contacto que siguen en estado no-gestionado
-- El WHERE status = 'nuevo' anterior nunca matcheaba porque el default real es 'abierto'.
-- Esta migración pasa a 'en_gestion' todos los leads que ya tienen timeline de contacto
-- pero que nunca recibieron la transición automática.
UPDATE tickets
SET status = 'en_gestion'
WHERE status NOT IN ('en_gestion', 'cotizado', 'financiamiento', 'ganado', 'perdido', 'cerrado')
  AND id IN (
    SELECT DISTINCT ticket_id
    FROM timeline
    WHERE type IN ('contact_registered', 'contact_evidence')
  );
