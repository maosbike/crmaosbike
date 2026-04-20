-- 057 — Blindaje de asignación de tickets
-- Invariante: seller_id = assigned_to SIEMPRE.
-- El trigger sincroniza automáticamente al actualizar cualquiera de los dos.
-- Elimina una clase entera de bugs donde PUT /:id actualizaba solo seller_id,
-- o /reassignments/manual actualizaba solo assigned_to, y los checks de permiso
-- quedaban inconsistentes.

-- 1. Backfill — normaliza filas existentes.
--    Si hay alguno seteado y el otro NULL, iguala ambos al valor no-NULL.
--    Si están distintos (ambos seteados pero diferentes), manda 'assigned_to'
--    como fuente de verdad (es el que usa el módulo de reasignación).
UPDATE tickets
   SET seller_id = COALESCE(assigned_to, seller_id),
       assigned_to = COALESCE(assigned_to, seller_id)
 WHERE seller_id IS DISTINCT FROM assigned_to;

-- 2. Trigger de sincronización.
CREATE OR REPLACE FUNCTION sync_ticket_assignment() RETURNS TRIGGER AS $$
BEGIN
  -- Si cambió seller_id, assigned_to sigue el mismo valor.
  -- Si cambió assigned_to, seller_id sigue el mismo valor.
  -- Si cambiaron ambos al mismo valor, no-op.
  -- Si cambiaron ambos a valores distintos (raro), gana assigned_to.
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    NEW.seller_id := NEW.assigned_to;
  ELSIF NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN
    NEW.assigned_to := NEW.seller_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tickets_sync_assign ON tickets;
CREATE TRIGGER trg_tickets_sync_assign
BEFORE UPDATE ON tickets
FOR EACH ROW EXECUTE FUNCTION sync_ticket_assignment();

-- 3. Trigger de INSERT: si se insertó con un solo campo, copia al otro.
CREATE OR REPLACE FUNCTION sync_ticket_assignment_insert() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS NULL AND NEW.seller_id IS NOT NULL THEN
    NEW.assigned_to := NEW.seller_id;
  ELSIF NEW.seller_id IS NULL AND NEW.assigned_to IS NOT NULL THEN
    NEW.seller_id := NEW.assigned_to;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tickets_sync_assign_ins ON tickets;
CREATE TRIGGER trg_tickets_sync_assign_ins
BEFORE INSERT ON tickets
FOR EACH ROW EXECUTE FUNCTION sync_ticket_assignment_insert();
