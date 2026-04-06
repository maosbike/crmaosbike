-- 035: Elimina el estado 'cerrado' del sistema
--
-- Motivo: 'cerrado' y 'perdido' tenían el mismo efecto funcional
-- (excluidos de activos, SLA, pipeline) pero semánticamente diferentes.
-- Los vendedores lo usaban en lugar de 'perdido' generando confusión.
-- Se consolida en un único estado de cierre negativo: 'perdido'.
--
-- Solo 'perdido' queda como cierre comercial negativo para vendedores.
-- El estado 'cerrado' desaparece del sistema.

UPDATE tickets
SET status = 'perdido', updated_at = NOW()
WHERE status = 'cerrado';
