require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const seed = require('../../migrations/002_seed');

async function migrate() {
  try {
    console.log('Running migrations...');
    const sql = fs.readFileSync(path.join(__dirname, '../../migrations/001_schema.sql'), 'utf-8');
    await db.query(sql);
    console.log('✓ Schema created');

    await seed(db);
    console.log('✓ All done');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
}

migrate();
