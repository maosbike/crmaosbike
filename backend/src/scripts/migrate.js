
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const seed = require('../../migrations/002_seed');

// Migrations that should run only ONCE (destructive or data-mutating)
const ONCE_ONLY = ['010','012','013','018'];

async function hasRun(name) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  const { rows } = await db.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name]);
  return rows.length > 0;
}

async function markRan(name) {
  await db.query('INSERT INTO schema_migrations(name) VALUES($1) ON CONFLICT DO NOTHING', [name]);
}

async function runMigration(num, label, sql) {
  const onlyOnce = ONCE_ONLY.includes(num);
  if (onlyOnce && await hasRun(num)) {
    console.log(`↩ Migration ${num} (${label}) already applied — skipping`);
    return;
  }
  await db.query(sql);
  if (onlyOnce) await markRan(num);
  console.log(`✓ Migration ${num} (${label}) applied`);
}

async function migrate() {
  try {
    console.log('Running migrations...');
    const m = (f) => fs.readFileSync(path.join(__dirname, '../../migrations', f), 'utf-8');

    await runMigration('001', 'schema',                      m('001_schema.sql'));
    await runMigration('003', 'username',                    m('003_username.sql'));
    await runMigration('004', 'password_change',             m('004_password_change.sql'));
    await runMigration('005', 'fix sla schema',              m('005_fix_sla_schema.sql'));
    await runMigration('006', 'import_logs',                 m('006_import_logs.sql'));
    await runMigration('007', 'fin_data JSONB',              m('007_fin_data.sql'));
    await runMigration('008', 'user_branches',               m('008_user_branches.sql'));
    await runMigration('009', 'catálogo + precios período',  m('009_moto_catalog_prices.sql'));
    await runMigration('010', 'limpieza modelos demo',       m('010_clean_seed_models.sql'));
    await runMigration('011', 'catalog enrich',              m('011_catalog_enrich.sql'));
    await runMigration('012', 'fix price_list bug',          m('012_fix_price_list_bug.sql'));
    await runMigration('013', 'clean precios mal cargados',  m('013_clean_prices.sql'));
    await runMigration('014', 'price_staging tables',        m('014_price_staging.sql'));
    await runMigration('015', 'fix branch addresses',        m('015_fix_branch_addresses.sql'));
    await runMigration('016', 'indexes + soft delete',       m('016_indexes_softdelete.sql'));
    await runMigration('017', 'model aliases',               m('017_model_aliases.sql'));
    await runMigration('018', 'restore ticket assignments',  m('018_restore_ticket_assignments.sql'));
    await runMigration('019', 'inventory sale fields',       m('019_inventory_sale_fields.sql'));
    await runMigration('020', 'inventory history log',       m('020_inventory_history.sql'));
    await runMigration('021', 'telegram chat id',              m('021_telegram_chat_id.sql'));
    await runMigration('022', 'ticket_num sequence',          m('022_ticket_num_seq.sql'));
    await runMigration('023', 'session_version',              m('023_session_version.sql'));

    // Seed solo corre si no hay usuarios — evita wiping assigned_to en cada deploy
    const { rows: existingUsers } = await db.query('SELECT 1 FROM users LIMIT 1');
    if (existingUsers.length === 0) {
      await seed(db);
      console.log('✓ Seed aplicado');
    } else {
      console.log('↩ Seed omitido — usuarios ya existen');
    }
    console.log('✓ All done');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
}

migrate();
