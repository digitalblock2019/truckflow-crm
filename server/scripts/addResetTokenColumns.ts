import { query } from '../src/config/database';

async function migrate() {
  console.log('Adding reset_token columns to users table...');
  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS reset_token TEXT,
    ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ
  `);
  console.log('Migration complete.');
  process.exit(0);
}

migrate().catch((err) => { console.error(err); process.exit(1); });
