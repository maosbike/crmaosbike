-- Add unit_photo field to inventory for main moto photo
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS unit_photo TEXT;
