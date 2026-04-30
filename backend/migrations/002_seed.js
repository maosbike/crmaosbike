const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Genera password aleatorio de 16 chars con mayús+minús+dígito+símbolo.
function generateInitialPassword() {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*+-=?';
  const all = upper + lower + digits + symbols;
  const pick = (s) => s[crypto.randomInt(0, s.length)];
  const arr = [pick(upper), pick(lower), pick(digits), pick(symbols),
               ...Array.from({ length: 12 }, () => pick(all))];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

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
  await safeDelete(`DELETE FROM model_aliases`);
  await safeDelete(`UPDATE tickets SET seller_id = NULL, assigned_to = NULL`);
  await db.query(`DELETE FROM users`);
  console.log('✓ Tabla users vaciada');

  // ─── USUARIOS ──────────────────────────────────────────────────────────────
  // Cada usuario recibe una contraseña inicial aleatoria distinta y se marca
  // con force_password_change=true. La password se imprime UNA SOLA VEZ al
  // ejecutar el seed (logs del primer deploy) — se debe rotar inmediatamente.
  // Esto evita una contraseña compartida adivinable en repositorios públicos.
  // Sobreescribir vía env INITIAL_PASSWORD si se necesita un valor común para tests.
  const sharedInitial = process.env.INITIAL_PASSWORD || null;

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

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  CONTRASEÑAS INICIALES — copialas y rotalas YA');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const [username, email, fn, ln, role, branch, extras] of users) {
    const initial = sharedInitial || generateInitialPassword();
    const hash = await bcrypt.hash(initial, 12);
    await db.query(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, role, branch_id, active, extra_branches, force_password_change)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8::uuid[], true)`,
      [username, email, hash, fn, ln, role, branch, extras]
    );
    console.log(`  ${email.padEnd(32)} → ${initial}   (${role})`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Todos los usuarios tienen force_password_change=true');
  console.log('  Ningún login será efectivo hasta que cada uno rote su clave.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // El catálogo de motos ya no se puebla desde la seed.
  // Se importa desde las listas de precios PDF reales (módulo pricelist).

  console.log('✓ Seed completado');
};
