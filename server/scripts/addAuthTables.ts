import dotenv from 'dotenv';
dotenv.config();

import { query } from '../src/config/database';

async function run() {
  console.log('Adding password_hash column and refresh_tokens table...');

  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
  `);
  console.log('  + password_hash column added to users');

  await query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);`);
  console.log('  + refresh_tokens table created');

  console.log('Done.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
