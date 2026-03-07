import dotenv from 'dotenv';
dotenv.config();

import { query } from '../src/config/database';

async function migrate() {
  console.log('Running Stripe + Wise migration...');

  const statements = [
    'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_payment_link_id TEXT',
    'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_payment_link_url TEXT',
    'ALTER TABLE invoice_branding ADD COLUMN IF NOT EXISTS wise_email TEXT',
  ];

  for (const sql of statements) {
    try {
      await query(sql);
      console.log(`  OK: ${sql.substring(0, 60)}...`);
    } catch (err: any) {
      console.error(`  FAIL: ${sql.substring(0, 60)}... — ${err.message}`);
    }
  }

  console.log('Migration complete.');
  process.exit(0);
}

migrate();
