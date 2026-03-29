-- Migración 021: secuencia segura para ticket_num
-- Reemplaza la generación basada en COUNT(*) + offset, que era vulnerable a
-- race conditions al crear tickets concurrentes.
--
-- La secuencia arranca desde el número más alto ya asignado + 1
-- para no romper tickets existentes.

DO $$
DECLARE
  max_num INTEGER;
BEGIN
  -- Extraer el número más alto de tickets existentes con formato SCM-XXXXXX
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(ticket_num FROM 5) AS INTEGER)),
    247001
  )
  INTO max_num
  FROM tickets
  WHERE ticket_num ~ '^SCM-[0-9]+$';

  -- Crear la secuencia solo si no existe
  IF NOT EXISTS (
    SELECT 1 FROM pg_sequences WHERE sequencename = 'ticket_num_seq'
  ) THEN
    EXECUTE format('CREATE SEQUENCE ticket_num_seq START WITH %s', max_num + 1);
  ELSE
    -- Si ya existe, asegurar que no genere números menores al máximo actual
    EXECUTE format('SELECT setval(''ticket_num_seq'', GREATEST(nextval(''ticket_num_seq''), %s))', max_num + 1);
  END IF;
END $$;
