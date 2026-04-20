-- Flag para habilitar usuarios no-vendedor a registrar ventas y recibir
-- leads manualmente, sin entrar al round-robin de importación.
-- La rotación automática sigue siendo role='vendedor' estricto.

ALTER TABLE users ADD COLUMN IF NOT EXISTS can_sell BOOLEAN DEFAULT false;

-- Vendedores "puros" siempre vendibles (compatibilidad retroactiva)
UPDATE users SET can_sell = true WHERE role = 'vendedor';

-- Joaquín + Miguel Ángel: pueden registrar ventas pero NO reciben leads en importación
UPDATE users SET can_sell = true
 WHERE LOWER(username) IN ('joaquin','miguelangel')
    OR LOWER(email)    IN ('joaquin@crmaosbike.cl','miguelangel@crmaosbike.cl');
