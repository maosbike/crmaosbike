-- Migration 027: Renombrar Mall Plaza Sur → Mall Plaza Sur - Motos
--               + Agregar sucursal Mall Plaza Sur - Yamaha
-- NO DESTRUCTIVO: solo UPDATE nombre (código MPS no cambia) + INSERT nuevo

-- Renombrar la sucursal existente para distinguirla de Yamaha
UPDATE branches
SET name = 'Mall Plaza Sur - Motos'
WHERE code = 'MPS' AND name = 'Mall Plaza Sur';

-- Nueva sucursal Yamaha en Plaza Sur
INSERT INTO branches (id, name, code, address, active)
VALUES (
  'b0000001-0001-0001-0001-000000000004',
  'Mall Plaza Sur - Yamaha',
  'MPSY',
  'Av. Pdte. Jorge Alessandri Rodríguez 20040',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Asegurar que también no falle por código duplicado
INSERT INTO branches (name, code, address, active)
SELECT 'Mall Plaza Sur - Yamaha', 'MPSY', 'Av. Pdte. Jorge Alessandri Rodríguez 20040', true
WHERE NOT EXISTS (SELECT 1 FROM branches WHERE code = 'MPSY');
