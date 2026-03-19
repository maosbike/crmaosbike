
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const seed = require('../../migrations/002_seed');

async function migrate() {
  try {
    console.log('Running migrations...');
    const sql = fs.readFileSync(path.join(__dirname, '../../migrations/001_schema.sql'), 'utf-8');
    await db.query(sql);
    console.log('✓ Schema 001 created');

    const sql003 = fs.readFileSync(path.join(__dirname, '../../migrations/003_username.sql'), 'utf-8');
    await db.query(sql003);
    console.log('✓ Migration 003 (username) applied');

    const sql004 = fs.readFileSync(path.join(__dirname, '../../migrations/004_password_change.sql'), 'utf-8');
    await db.query(sql004);
    console.log('✓ Migration 004 (password_change) applied');

    const sql005 = fs.readFileSync(path.join(__dirname, '../../migrations/005_fix_sla_schema.sql'), 'utf-8');
    await db.query(sql005);
    console.log('✓ Migration 005 (fix sla schema + assigned_to + UUID FKs) applied');

    const sql006 = fs.readFileSync(path.join(__dirname, '../../migrations/006_import_logs.sql'), 'utf-8');
    await db.query(sql006);
    console.log('✓ Migration 006 (import_logs) applied');

    await seed(db);
    console.log('✓ All done');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
}

migrate();
