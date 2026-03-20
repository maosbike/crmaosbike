-- Migration 010: Eliminar modelos demo insertados por la seed inicial.
-- El catálogo se poblará desde las listas de precios PDF reales.
-- Se ejecuta con IF EXISTS para ser idempotente.

DELETE FROM moto_prices WHERE model_id IN (
  SELECT id FROM moto_models WHERE (brand, model) IN (
    ('Honda', 'CB 190R'), ('Honda', 'PCX 160'),
    ('Yamaha', 'R15 V4'), ('Yamaha', 'MT-03'), ('Yamaha', 'NMAX Connected'),
    ('Suzuki', 'Gixxer 250 SF'), ('Suzuki', 'V-Strom 250 SX'),
    ('Benelli', 'TNT 300'), ('Benelli', 'TRK 502 X'),
    ('Keeway', 'RKF 125'),
    ('Royal Enfield', 'Classic 350'), ('Royal Enfield', 'Himalayan 450'),
    ('Zontes', '350T'), ('Voge', '500 DS'), ('Can-Am', 'Ryker 600'),
    ('Kymco', 'AK 550'), ('QJ Motor', 'SRV 300'), ('Benda', 'Napoleon 300'),
    ('Segway', 'E125'), ('Takasaki', 'TK 200'), ('UM', 'Renegade Sport S')
  )
);

DELETE FROM moto_models WHERE (brand, model) IN (
  ('Honda', 'CB 190R'), ('Honda', 'PCX 160'),
  ('Yamaha', 'R15 V4'), ('Yamaha', 'MT-03'), ('Yamaha', 'NMAX Connected'),
  ('Suzuki', 'Gixxer 250 SF'), ('Suzuki', 'V-Strom 250 SX'),
  ('Benelli', 'TNT 300'), ('Benelli', 'TRK 502 X'),
  ('Keeway', 'RKF 125'),
  ('Royal Enfield', 'Classic 350'), ('Royal Enfield', 'Himalayan 450'),
  ('Zontes', '350T'), ('Voge', '500 DS'), ('Can-Am', 'Ryker 600'),
  ('Kymco', 'AK 550'), ('QJ Motor', 'SRV 300'), ('Benda', 'Napoleon 300'),
  ('Segway', 'E125'), ('Takasaki', 'TK 200'), ('UM', 'Renegade Sport S')
);
