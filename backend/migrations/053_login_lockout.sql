-- Migration 053: login lockout
-- Per-user brute-force protection: cuenta intentos fallidos y bloquea
-- temporalmente la cuenta tras N fallos seguidos.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_attempts INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS users_locked_until_idx ON users(locked_until);
