import { query } from '../src/config/database';

async function migrate() {
  try {
    console.log('Adding sales_and_dispatcher to employee_type enum...');
    await query("ALTER TYPE employee_type ADD VALUE IF NOT EXISTS 'sales_and_dispatcher'");
    console.log('Migration complete.');
    process.exit(0);
  } catch (err: any) {
    // "IF NOT EXISTS" requires PostgreSQL 9.3+
    if (err.message?.includes('already exists')) {
      console.log('Value already exists, skipping.');
      process.exit(0);
    }
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
