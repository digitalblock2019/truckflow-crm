import dotenv from 'dotenv';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');
dotenv.config();

import pool, { query } from '../src/config/database';

async function migrate() {
  try {
    // Add 'imported' to trucker_status enum
    await query("ALTER TYPE trucker_status ADD VALUE IF NOT EXISTS 'imported'");
    console.log("Added 'imported' to trucker_status enum");

    // Update existing imported records from 'called' to 'imported' where they came from bulk import
    const result = await query(
      "UPDATE truckers SET status_system = 'imported' WHERE status_system = 'called' AND upload_batch_id IS NOT NULL"
    );
    console.log(`Updated ${result.rowCount} existing imported records from 'called' to 'imported'`);
  } catch (err: any) {
    console.error('Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
