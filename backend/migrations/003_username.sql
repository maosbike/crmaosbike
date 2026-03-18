-- 003_username.sql: agregar username, hacer email nullable

-- 1. Hacer email nullable (actualmente NOT NULL)
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- 2. Agregar columna username si no existe
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50);

-- 3. Agregar constraint UNIQUE en username (solo si no existe)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_username_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
  END IF;
END $$;

-- 4. Índice para búsqueda rápida por username
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
