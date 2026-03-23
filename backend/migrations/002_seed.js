const bcrypt = require('bcryptjs');

module.exports = async function seed(db) {

  // ─── BRANCHES ──────────────────────────────────────────────────────────────
  await db.query(`
    INSERT INTO branches (id, name, code, address) VALUES
    ('b0000001-0001-0001-0001-000000000001', 'Mall Plaza Norte', 'MPN', 'Av. Américo Vespucio 1737, Auto Plaza Local 106, Huechuraba'),
    ('b0000001-0001-0001-0001-000000000002', 'Mall Plaza Sur',   'MPS', 'Av. Pdte. Jorge Alessandri Rodríguez 20040'),
    ('b0000001-0001-0001-0001-000000000003', 'Movicenter',       'MOV', 'Av. Américo Vespucio 1155, Huechuraba')
    ON CONFLICT (code) DO NOTHING
  `);

  // ─── LIMPIAR USUARIOS: manejar FKs antes de DELETE ─────────────────────────
  // Tablas que referencian users — limpiar en orden para evitar FK violations
  const safeDelete = async (sql) => { try { await db.query(sql); } catch (_) {} };
  await safeDelete(`DELETE FROM price_import_logs`);
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

  // El catálogo de motos ya no se puebla desde la seed.
  // Se importa desde las listas de precios PDF reales (módulo pricelist).

  console.log('✓ Seed completado');
};
