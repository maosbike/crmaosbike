const bcrypt = require('bcryptjs');

module.exports = async function seed(db) {
  const hash = await bcrypt.hash('maosbike2024', 10);

  // Branches
  await db.query(`
    INSERT INTO branches (id, name, code, address) VALUES
    ('b0000001-0001-0001-0001-000000000001', 'Mall Plaza Norte', 'MPN', 'Av. Américo Vespucio 1737, Auto Plaza Local 106, Huechuraba'),
    ('b0000001-0001-0001-0001-000000000002', 'Mall Plaza Sur', 'MPS', 'Av. Vicuña Mackenna 13451, La Florida'),
    ('b0000001-0001-0001-0001-000000000003', 'Movicenter', 'MOV', 'Av. Américo Vespucio 1001, Cerrillos')
    ON CONFLICT (code) DO NOTHING
  `);

  // Users
  const users = [
    ['admin@crmaosbike.cl', hash, 'Carlos', 'Mao', 'super_admin', null],
    ['jefe@crmaosbike.cl', hash, 'Patricia', 'González', 'admin_comercial', 'b0000001-0001-0001-0001-000000000001'],
    ['fran@crmaosbike.cl', hash, 'Francisca', 'Reyes', 'backoffice', null],
    ['diego@crmaosbike.cl', hash, 'Diego', 'Muñoz', 'vendedor', 'b0000001-0001-0001-0001-000000000001'],
    ['javiera@crmaosbike.cl', hash, 'Javiera', 'López', 'vendedor', 'b0000001-0001-0001-0001-000000000001'],
    ['roberto@crmaosbike.cl', hash, 'Roberto', 'Soto', 'vendedor', 'b0000001-0001-0001-0001-000000000002'],
    ['catalina@crmaosbike.cl', hash, 'Catalina', 'Vera', 'vendedor', 'b0000001-0001-0001-0001-000000000002'],
    ['andres@crmaosbike.cl', hash, 'Andrés', 'Fuentes', 'vendedor', 'b0000001-0001-0001-0001-000000000003'],
  ];

  for (const [email, pw, fn, ln, role, branch] of users) {
    await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, branch_id)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (email) DO NOTHING`,
      [email, pw, fn, ln, role, branch]
    );
  }

  // Moto catalog
  const motos = [
    ['Honda','CB 190R',2025,184,'Sport','["Negro","Rojo","Azul"]',2490000,100000],
    ['Honda','PCX 160',2025,156,'Scooter','["Blanco","Azul","Negro"]',3290000,150000],
    ['Yamaha','R15 V4',2025,155,'Sport','["Azul","Negro","Gris"]',3790000,0],
    ['Yamaha','MT-03',2025,321,'Naked','["Azul","Negro"]',4590000,200000],
    ['Yamaha','NMAX Connected',2025,155,'Scooter','["Negro","Azul"]',2890000,100000],
    ['Suzuki','Gixxer 250 SF',2025,249,'Sport','["Negro/Azul","Rojo"]',3490000,100000],
    ['Suzuki','V-Strom 250 SX',2025,249,'Adventure','["Amarillo","Negro"]',3790000,100000],
    ['Benelli','TNT 300',2025,300,'Naked','["Rojo","Negro"]',3690000,150000],
    ['Benelli','TRK 502 X',2025,500,'Adventure','["Gris","Negro"]',5990000,200000],
    ['Keeway','RKF 125',2025,125,'Sport','["Negro","Azul"]',1490000,50000],
    ['Royal Enfield','Classic 350',2025,349,'Clásica','["Negro","Verde"]',4590000,100000],
    ['Royal Enfield','Himalayan 450',2025,452,'Adventure','["Negro","Gris"]',5990000,150000],
    ['Zontes','350T',2025,349,'Naked','["Negro","Blanco"]',4290000,100000],
    ['Voge','500 DS',2025,471,'Adventure','["Negro","Gris"]',4990000,150000],
    ['Can-Am','Ryker 600',2025,600,'3 Ruedas','["Negro","Rojo"]',8990000,0],
    ['Kymco','AK 550',2025,550,'Maxi Scooter','["Negro","Gris"]',7990000,200000],
    ['QJ Motor','SRV 300',2025,296,'Naked','["Negro","Azul"]',3290000,100000],
    ['Benda','Napoleon 300',2025,298,'Cruiser','["Negro","Verde"]',3490000,100000],
    ['Segway','E125',2025,0,'Eléctrica','["Blanco","Negro"]',2490000,100000],
    ['Takasaki','TK 200',2025,200,'Sport','["Negro","Rojo"]',1290000,50000],
    ['UM','Renegade Sport S',2025,230,'Cruiser','["Negro"]',2290000,100000],
  ];

  for (const [brand, model, year, cc, cat, colors, price, bonus] of motos) {
    await db.query(
      `INSERT INTO moto_models (brand, model, year, cc, category, colors, price, bonus)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       ON CONFLICT DO NOTHING`,
      [brand, model, year, cc, cat, colors, price, bonus]
    );
  }

  console.log('✓ Seed completado');
};
