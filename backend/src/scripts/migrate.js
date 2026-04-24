
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const seed = require('../../migrations/002_seed');

// Migrations that should run only ONCE (destructive or data-mutating)
const ONCE_ONLY = ['010','012','013','018','032','033','034','035'];

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
    await runMigration('024', 'sales extended fields',        m('024_sales_extended_fields.sql'));
    await runMigration('025', 'inventory unit photo',          m('025_inventory_unit_photo.sql'));
    await runMigration('026', 'timeline evidence fields',       m('026_timeline_evidence.sql'));
    await runMigration('027', 'branches update + yamaha',       m('027_branches_update.sql'));
    await runMigration('028', 'inventory sort_order',           m('028_inventory_sort_order.sql'));
    await runMigration('029', 'fix branch names',               m('029_fix_branch_names.sql'));
    await runMigration('030', 'distributor paid status',        m('030_distributor_paid.sql'));
    await runMigration('031', 'ticket birthdate column',        m('031_birthdate.sql'));
    await runMigration('032', 'fix status leads con evidencia', m('032_fix_status_evidencia.sql'));
    await runMigration('033', 'fix SLA fields retroactivo',    m('033_fix_sla_fields_retroactivo.sql'));
    await runMigration('034', 'add status nuevo',               m('034_add_status_nuevo.sql'));
    await runMigration('035', 'remove cerrado status',          m('035_remove_cerrado.sql'));
    await runMigration('036', 'chassis nullable',               m('036_chassis_nullable.sql'));
    await runMigration('037', 'bono condicion y tipo',          m('037_bono_condicion.sql'));
    await runMigration('038', 'color photos por modelo',        m('038_color_photos.sql'));
    // 039: script JS (vendedor Maos) — solo si el archivo existe
    if (!(await hasRun('039'))) {
      try {
        const m039 = require('../../migrations/039_maos_seller');
        await m039(db);
        await markRan('039');
        console.log('✓ Migration 039 (maos seller) applied');
      } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND') {
          await markRan('039');
          console.log('↩ Migration 039 (maos seller) skipped — archivo no encontrado');
        } else { throw e; }
      }
    }
    await runMigration('040', 'branch photo',                   m('040_branch_photo.sql'));
    await runMigration('041', 'supplier payments',              m('041_supplier_payments.sql'));
    await runMigration('042', 'supplier payments extra fields', m('042_supplier_payments_extra_fields.sql'));
    await runMigration('043', 'supplier paid amount',           m('043_supplier_paid_amount.sql'));
    await runMigration('044', 'supplier payments model_id',    m('044_supplier_payments_model_id.sql'));
    await runMigration('045', 'sales notes table',             m('045_sales_notes.sql'));
    await runMigration('046', 'lead followup + needs_attention',m('046_lead_followup.sql'));
    await runMigration('047', 'supplier_payments.model_id ON DELETE SET NULL', m('047_supplier_payments_fk_set_null.sql'));
    await runMigration('049', 'inventory color_hex',                           m('049_inventory_color_hex.sql'));
    await runMigration('050', 'sales_notes.model_id',                          m('050_sales_notes_model_id.sql'));
    await runMigration('051', 'brands + brand_categories',                     m('051_brands_and_categories.sql'));
    await runMigration('052', 'can_sell flag',                                 m('052_can_sell.sql'));
    await runMigration('053', 'login lockout',                                 m('053_login_lockout.sql'));
    await runMigration('054', 'user time off (d\u00edas libres)',                   m('054_user_time_off.sql'));
    await runMigration('055', 'sale extras',                                   m('055_sale_extras.sql'));
    await runMigration('056', 'accounting invoices',                           m('056_accounting_invoices.sql'));
    await runMigration('057', 'sync ticket assignment trigger',                m('057_sync_ticket_assignment.sql'));
    await runMigration('058', 'invoices refs (notas de cr\u00e9dito)',               m('058_invoices_refs.sql'));
    await runMigration('059', 'invoices.model_id FK al cat\u00e1logo',                m('059_invoices_model_id.sql'));
    await runMigration('060', 'invoices.ref_tipo (anulacion/correccion/ajuste)', m('060_invoices_ref_tipo.sql'));
    await runMigration('061', 'abono_lines (multi-medio en reservas)',          m('061_abono_lines.sql'));

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
