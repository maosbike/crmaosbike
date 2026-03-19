-- Soporte para vendedores con múltiples sucursales
-- Camila cubre tanto MPS como MPN — extra_branches almacena sucursales adicionales
ALTER TABLE users ADD COLUMN IF NOT EXISTS extra_branches UUID[] DEFAULT '{}';
