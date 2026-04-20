-- Migration 054: user_time_off
-- Días libres por vendedor. Cuando un usuario tiene off_date = hoy (TZ Chile)
-- queda excluido de la asignación de nuevos leads y no recibe notificaciones.
-- No afecta tickets ya asignados: el SLA se encarga de reasignar si se vence.

CREATE TABLE IF NOT EXISTS user_time_off (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  off_date    DATE        NOT NULL,
  note        TEXT,
  created_by  UUID        REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, off_date)
);

CREATE INDEX IF NOT EXISTS user_time_off_date_idx ON user_time_off(off_date);
CREATE INDEX IF NOT EXISTS user_time_off_user_idx ON user_time_off(user_id);
