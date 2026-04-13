-- 041 — Pagos a proveedor/distribuidor
CREATE TABLE IF NOT EXISTS supplier_payments (
  id               SERIAL PRIMARY KEY,
  provider         VARCHAR(200),
  invoice_number   VARCHAR(100),
  invoice_date     DATE,
  due_date         DATE,
  payment_date     DATE,
  total_amount     BIGINT,
  receipt_number   VARCHAR(100),
  payer_name       VARCHAR(200),
  brand            VARCHAR(100),
  model            VARCHAR(200),
  color            VARCHAR(100),
  commercial_year  SMALLINT,
  motor_num        VARCHAR(100),
  chassis          VARCHAR(100),
  internal_code    VARCHAR(100),
  invoice_url      TEXT,
  receipt_url      TEXT,
  notes            TEXT,
  status           VARCHAR(30) DEFAULT 'pendiente',  -- pendiente | pagado | revisado
  created_by       INTEGER REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supay_invoice  ON supplier_payments(invoice_number);
CREATE INDEX IF NOT EXISTS idx_supay_status   ON supplier_payments(status);
CREATE INDEX IF NOT EXISTS idx_supay_chassis  ON supplier_payments(chassis);
