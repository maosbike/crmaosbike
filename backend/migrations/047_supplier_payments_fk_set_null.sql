-- 047: supplier_payments.model_id ON DELETE SET NULL
--
-- Motivo: sin cláusula explícita, borrar un modelo del catálogo falla por FK
-- si hay pagos vinculados. Cambiamos la constraint para que, si se elimina el
-- modelo, los pagos queden con model_id = NULL (conservan brand/model texto).
--
-- No destructivo: solo cambia el comportamiento de la FK. No toca datos.

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'supplier_payments'::regclass
    AND contype = 'f'
    AND pg_get_constraintdef(oid) ILIKE '%REFERENCES moto_models%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE supplier_payments DROP CONSTRAINT %I', con_name);
  END IF;

  ALTER TABLE supplier_payments
    ADD CONSTRAINT supplier_payments_model_id_fkey
    FOREIGN KEY (model_id) REFERENCES moto_models(id) ON DELETE SET NULL;
END $$;
