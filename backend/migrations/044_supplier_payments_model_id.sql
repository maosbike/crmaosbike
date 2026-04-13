-- Link supplier_payments to moto_models catalog
ALTER TABLE supplier_payments
  ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES moto_models(id);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_model_id ON supplier_payments(model_id);
