-- 036: Hace chassis nullable en inventory
-- Permite importar unidades sin N° de chasis conocido para completarlas manualmente.
-- La restricción UNIQUE se mantiene (múltiples NULL sí son permitidos por PostgreSQL).
ALTER TABLE inventory ALTER COLUMN chassis DROP NOT NULL;
