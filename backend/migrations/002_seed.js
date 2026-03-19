const bcrypt = require('bcryptjs');

module.exports = async function seed(db) {

  // ─── BRANCHES ──────────────────────────────────────────────────────────────
  await db.query(`
    INSERT INTO branches (id, name, code, address) VALUES
    ('b0000001-0001-0001-0001-000000000001', 'Mall Plaza Norte', 'MPN', 'Av. Américo Vespucio 1737, Auto Plaza Local 106, Huechuraba'),
    ('b0000001-0001-0001-0001-000000000002', 'Mall Plaza Sur',   'MPS', 'Av. Vicuña Mackenna 13451, La Florida'),
    ('b0000001-0001-0001-0001-000000000003', 'Movicenter',       'MOV', 'Av. Américo Vespucio 1001, Cerrillos')
    ON CONFLICT (code) DO NOTHING
  `);

  // ─── LIMPIAR USUARIOS: manejar FKs antes de DELETE ─────────────────────────
  // Tablas que referencian users — limpiar en orden para evitar FK violations
  const safeDelete = async (sql) => { try { await db.query(sql); } catch (_) {} };
  await safeDelete(`DELETE FROM reassignment_log`);
  await safeDelete(`DELETE FROM notifications`);
  await safeDelete(`DELETE FROM reminders`);
  await safeDelete(`DELETE FROM timeline`);
  await safeDelete(`DELETE FROM import_logs`);
  await safeDelete(`UPDATE tickets SET seller_id = NULL, assigned_to = NULL`);
  await db.query(`DELETE FROM users`);
  console.log('✓ Tabla users vaciada');

  // ─── USUARIOS ──────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash('maosbike2026', 10);

  const MPN = 'b0000001-0001-0001-0001-000000000001'; // Mall Plaza Norte
  const MPS = 'b0000001-0001-0001-0001-000000000002'; // Mall Plaza Sur

  // [username, email, first_name, last_name, role, branch_id, extra_branches]
  // extra_branches: sucursales adicionales — Camila cubre MPS y MPN
  const users = [
    ['joaquin',     'joaquin@crmaosbike.cl',     'Joaquín',     'Oliva',  'super_admin',     null, []],
    ['javiera',     'javiera@crmaosbike.cl',     'Javiera',     '-',      'vendedor',        MPN,  []],
    ['camila',      'camila@crmaosbike.cl',      'Camila',      '-',      'vendedor',        MPS,  [MPN]],
    ['pauli',       'pauli@crmaosbike.cl',       'Pauli',       '-',      'vendedor',        MPS,  []],
    ['eduardo',     'eduardo@crmaosbike.cl',     'Eduardo',     '-',      'vendedor',        MPN,  []],
    ['ahentua',     'ahentua@crmaosbike.cl',     'Ahentua',     '-',      'vendedor',        MPS,  []],
    ['miguelangel', 'miguelangel@crmaosbike.cl', 'Miguel Ángel','-',      'admin_comercial', null, []],
    ['fran',        'fran@crmaosbike.cl',        'Fran',        '-',      'backoffice',      null, []],
  ];

  for (const [username, email, fn, ln, role, branch, extras] of users) {
    await db.query(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, role, branch_id, active, extra_branches)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8::uuid[])`,
      [username, email, hash, fn, ln, role, branch, extras]
    );
    console.log(`  ✓ ${username} (${role}${branch ? ` · ${branch === MPN ? 'MPN' : 'MPS'}${extras.length ? '+extra' : ''}` : ''})`);
  }

  // ─── CATÁLOGO DE MOTOS ─────────────────────────────────────────────────────
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
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8) ON CONFLICT DO NOTHING`,
      [brand, model, year, cc, cat, colors, price, bonus]
    );
  }

  console.log('✓ Seed completado');
};
