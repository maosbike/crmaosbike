-- 003_username.sql: agregar username, hacer email nullable

-- 1. Hacer email nullable
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- 2. Agregar columna username si no existe
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50);

-- 3. Unique index parcial (excluye NULLs, más seguro que constraint)
CREATE UNIQUE INDEX IF NOT EXISTS users_username_ukey ON users(username) WHERE username IS NOT NULL;

-- 4. Índice general para búsqueda
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
