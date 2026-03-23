-- 015_fix_branch_addresses.sql
-- Corrige las direcciones incorrectas de Movicenter y Mall Plaza Sur.
UPDATE branches SET address = 'Av. Américo Vespucio 1155, Huechuraba'          WHERE code = 'MOV';
UPDATE branches SET address = 'Av. Pdte. Jorge Alessandri Rodríguez 20040'     WHERE code = 'MPS';
