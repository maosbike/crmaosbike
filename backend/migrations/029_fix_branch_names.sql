-- Migration 029: Corrección nomenclatura de sucursales
-- NO DESTRUCTIVO: solo UPDATE nombres existentes

UPDATE branches SET name = 'Mall Plaza Sur'        WHERE code = 'MPS';
UPDATE branches SET name = 'Mall Plaza Sur Yamaha' WHERE code = 'MPSY';
