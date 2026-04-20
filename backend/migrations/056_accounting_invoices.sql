-- 056 — Contabilidad: facturas emitidas y recibidas
-- MVP: facturas emitidas (motos) con cruce por RUT cliente y chasis.
-- Source = 'emitida' (Maosbike factura) | 'recibida' (proveedor factura a Maosbike)
-- Category = 'motos' | 'partes' | 'servicios' | 'municipal' | 'otros'
-- Status = 'vinculada' (cliente+chasis OK) | 'sin_vincular' (nada) | 'revisar' (match parcial / ambiguo)

CREATE TABLE IF NOT EXISTS invoices (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  source            VARCHAR(20) NOT NULL DEFAULT 'emitida',
  doc_type          VARCHAR(30) NOT NULL DEFAULT 'factura',
  category          VARCHAR(30) NOT NULL DEFAULT 'motos',

  -- Identificación del documento
  folio             VARCHAR(50),
  rut_emisor        VARCHAR(20),
  emisor_nombre     VARCHAR(250),

  -- Cliente (emitidas) o receptor (recibidas)
  rut_cliente       VARCHAR(20),
  cliente_nombre    VARCHAR(250),
  cliente_direccion TEXT,
  cliente_comuna    VARCHAR(100),
  cliente_giro      VARCHAR(250),

  -- Fechas y montos
  fecha_emision     DATE,
  monto_neto        BIGINT,
  iva               BIGINT,
  monto_exento      BIGINT,
  total             BIGINT,

  -- Datos de vehículo (si aplica — motos)
  brand             VARCHAR(100),
  model             VARCHAR(200),
  color             VARCHAR(100),
  commercial_year   SMALLINT,
  motor_num         VARCHAR(100),
  chassis           VARCHAR(100),
  descripcion       TEXT,

  -- Archivo + origen
  pdf_url           TEXT,
  drive_file_id     VARCHAR(200),

  -- Cruces
  lead_id           UUID        REFERENCES tickets(id)   ON DELETE SET NULL,
  inventory_id      UUID        REFERENCES inventory(id) ON DELETE SET NULL,
  sale_note_id      UUID        REFERENCES sales_notes(id) ON DELETE SET NULL,

  -- Estado de vinculación + notas internas
  link_status       VARCHAR(30) NOT NULL DEFAULT 'sin_vincular',
  notes             TEXT,

  created_by        UUID        REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unicidad pragmática: un mismo folio emitido por el mismo RUT emisor no se duplica.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_folio_emisor
  ON invoices(source, folio, rut_emisor)
  WHERE folio IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_rut_cliente ON invoices(rut_cliente);
CREATE INDEX IF NOT EXISTS idx_invoices_chassis     ON invoices(chassis);
CREATE INDEX IF NOT EXISTS idx_invoices_fecha       ON invoices(fecha_emision);
CREATE INDEX IF NOT EXISTS idx_invoices_source      ON invoices(source);
CREATE INDEX IF NOT EXISTS idx_invoices_category    ON invoices(category);
CREATE INDEX IF NOT EXISTS idx_invoices_link_status ON invoices(link_status);
CREATE INDEX IF NOT EXISTS idx_invoices_lead        ON invoices(lead_id);
CREATE INDEX IF NOT EXISTS idx_invoices_inventory   ON invoices(inventory_id);

DROP TRIGGER IF EXISTS trg_invoices_ts ON invoices;
CREATE TRIGGER trg_invoices_ts BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_timestamp();
