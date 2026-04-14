-- Migration 045: sales_notes table
-- Notas comerciales (reserva/venta sin unidad real de inventario).
-- No toca la tabla inventory — cero filas falsas de stock.

CREATE TABLE IF NOT EXISTS sales_notes (
  id               SERIAL PRIMARY KEY,
  status           TEXT        NOT NULL DEFAULT 'reservada' CHECK (status IN ('reservada','vendida')),
  brand            TEXT        NOT NULL,
  model            TEXT        NOT NULL,
  year             INTEGER,
  color            TEXT,
  chassis          TEXT,
  motor_num        TEXT,
  price            INTEGER     NOT NULL DEFAULT 0,
  sale_price       INTEGER,
  cost_price       INTEGER,
  invoice_amount   INTEGER,
  sold_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sold_by          INTEGER     REFERENCES users(id),
  branch_id        INTEGER     REFERENCES branches(id),
  ticket_id        INTEGER     REFERENCES tickets(id),
  payment_method   TEXT,
  sale_type        TEXT,
  sale_notes       TEXT,
  delivered        BOOLEAN     NOT NULL DEFAULT FALSE,
  distributor_paid BOOLEAN     NOT NULL DEFAULT FALSE,
  client_name      TEXT,
  client_rut       TEXT,
  doc_factura_dist TEXT,
  doc_factura_cli  TEXT,
  doc_homologacion TEXT,
  doc_inscripcion  TEXT,
  created_by       INTEGER     REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sales_notes_status_idx    ON sales_notes(status);
CREATE INDEX IF NOT EXISTS sales_notes_sold_at_idx   ON sales_notes(sold_at);
CREATE INDEX IF NOT EXISTS sales_notes_sold_by_idx   ON sales_notes(sold_by);
CREATE INDEX IF NOT EXISTS sales_notes_branch_idx    ON sales_notes(branch_id);
