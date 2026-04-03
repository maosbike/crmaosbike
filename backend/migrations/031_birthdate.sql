-- Agrega columna birthdate a tickets para guardar fecha de nacimiento del cliente
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS birthdate DATE;
