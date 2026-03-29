-- Migración 023: session_version en users
-- Permite invalidar todos los refresh tokens existentes de un usuario
-- al cambiar o resetear su contraseña.
-- El payload del refresh token incluye sv (session_version).
-- Si sv del token != sv en DB → token inválido → fuerza nuevo login.

ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
