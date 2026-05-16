import dotenv from 'dotenv';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');
dotenv.config();

import pool, { query } from '../src/config/database';

async function migrate() {
  try {
    await query(`ALTER TABLE truckers ADD COLUMN IF NOT EXISTS city TEXT`);
    await query(`ALTER TABLE truckers ADD COLUMN IF NOT EXISTS truck_types TEXT[]`);
    await query(`ALTER TABLE truckers ADD COLUMN IF NOT EXISTS truck_length_ft NUMERIC(6,2)`);
    await query(`ALTER TABLE truckers ADD COLUMN IF NOT EXISTS truck_width_ft NUMERIC(6,2)`);
    await query(`ALTER TABLE truckers ADD COLUMN IF NOT EXISTS truck_height_ft NUMERIC(6,2)`);
    await query(`ALTER TABLE truckers ADD COLUMN IF NOT EXISTS max_payload_lbs INTEGER`);
    console.log('Added trucker onboarding fields: city, truck_types[], truck_length_ft, truck_width_ft, truck_height_ft, max_payload_lbs');
  } catch (err: any) {
    console.error('Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
