-- 037: Agrega campos de condición y tipo de bono a moto_models
-- Permite que el admin especifique bajo qué condición aplica el bono
-- en lugar de asumir siempre "todo medio de pago"

ALTER TABLE moto_models
  ADD COLUMN IF NOT EXISTS bono_tipo        VARCHAR(100),   -- ej: "Bono mes", "Bono aniversario"
  ADD COLUMN IF NOT EXISTS bono_condicion   VARCHAR(60),    -- enum: todo_medio_pago | solo_financiamiento | solo_autofin | contado_transferencia | otro
  ADD COLUMN IF NOT EXISTS bono_requisitos  TEXT;           -- texto libre con requisitos adicionales
