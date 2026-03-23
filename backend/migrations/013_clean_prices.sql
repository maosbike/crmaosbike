-- 013_clean_prices.sql
-- Limpia todos los precios cargados por el flujo PDF anterior.
-- Deja precio=0 y bonus=0 en todos los modelos hasta nueva importación validada.
BEGIN;
UPDATE moto_models SET price = 0, bonus = 0, updated_at = NOW();
DELETE FROM moto_prices;
DELETE FROM price_import_logs;
COMMIT;
