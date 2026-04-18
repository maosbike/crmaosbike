-- Migration 049: Hex tonal por unidad de inventario
-- Permite guardar el tono visual elegido con el ColorPicker al editar una unidad.
-- El campo `color` sigue almacenando el nombre ("AZUL", "NEGRO", etc).

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS color_hex TEXT;
