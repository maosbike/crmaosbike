-- Migration 024: Campos extendidos para módulo de ventas
-- Agrega: precio final de venta, costos internos (SENSIBLES — nunca a vendedores),
-- documentos adjuntos (Cloudinary URLs), estado de entrega, cliente manual.

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS sale_price       BIGINT,        -- precio final de venta al cliente
  ADD COLUMN IF NOT EXISTS cost_price       BIGINT,        -- costo compra a distribuidor (SENSIBLE)
  ADD COLUMN IF NOT EXISTS invoice_amount   BIGINT,        -- monto facturado por distribuidor (SENSIBLE)
  ADD COLUMN IF NOT EXISTS delivered        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS doc_factura_dist TEXT,          -- URL Cloudinary: factura del distribuidor
  ADD COLUMN IF NOT EXISTS doc_factura_cli  TEXT,          -- URL Cloudinary: factura entregada al cliente
  ADD COLUMN IF NOT EXISTS doc_homologacion TEXT,          -- URL Cloudinary: homologación
  ADD COLUMN IF NOT EXISTS doc_inscripcion  TEXT,          -- URL Cloudinary: documentación inscripción completa
  ADD COLUMN IF NOT EXISTS client_name      TEXT,          -- nombre cliente (si no hay ticket vinculado)
  ADD COLUMN IF NOT EXISTS client_rut       TEXT;          -- rut cliente (si no hay ticket vinculado)
