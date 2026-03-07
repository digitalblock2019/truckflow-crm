import dotenv from 'dotenv';
dotenv.config();

import { query } from '../src/config/database';

async function migrate() {
  console.log('Adding profile_image_path column to users table...');
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_path TEXT`);
  console.log('Done.');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
