import dotenv from 'dotenv';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');
dotenv.config();

import pool, { query } from '../src/config/database';

async function migrate() {
  try {
    await query(`ALTER TABLE truckers ADD COLUMN IF NOT EXISTS operation_type TEXT`);
    await query(`ALTER TABLE truckers ADD COLUMN IF NOT EXISTS preferred_lanes JSONB`);
    await query(`ALTER TABLE truckers ADD COLUMN IF NOT EXISTS operating_states TEXT[]`);
    await query(`ALTER TABLE truckers ADD COLUMN IF NOT EXISTS avoid_states TEXT[]`);
    await query(`ALTER TABLE truckers ADD COLUMN IF NOT EXISTS preferred_days TEXT[]`);
    console.log('Added trucker routes & availability fields: operation_type, preferred_lanes, operating_states[], avoid_states[], preferred_days[]');
  } catch (err: any) {
    console.error('Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
