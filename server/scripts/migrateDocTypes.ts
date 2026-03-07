/**
 * Migration: Rework trucker onboarding document types
 * - Adds condition_flag column to trucker_document_types
 * - Adds 3 boolean flags to truckers table
 * - Replaces all document types with 7 specific ones
 */
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add condition_flag column to trucker_document_types (if not exists)
    await client.query(`
      ALTER TABLE trucker_document_types
      ADD COLUMN IF NOT EXISTS condition_flag TEXT DEFAULT NULL
    `);

    // 2. Add 3 boolean flag columns to truckers (if not exists)
    await client.query(`
      ALTER TABLE truckers
      ADD COLUMN IF NOT EXISTS uses_factoring BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS is_new_authority BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS uses_quick_pay BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // 3. Delete all existing document types
    await client.query('DELETE FROM trucker_document_types');

    // 4. Insert 7 new document types
    await client.query(`
      INSERT INTO trucker_document_types (slug, label, is_required, sort_order, condition_flag) VALUES
        ('mc_authority_letter',          'MC Authority Letter',              TRUE,  1, NULL),
        ('w9_form',                      'W-9 Form',                        TRUE,  2, NULL),
        ('certificate_of_insurance',     'Certificate of Insurance (COI)',   TRUE,  3, NULL),
        ('dispatcher_carrier_agreement', 'Dispatcher–Carrier Agreement',    TRUE,  4, NULL),
        ('notice_of_assignment',         'Notice of Assignment',            FALSE, 5, 'uses_factoring'),
        ('cdl_copy',                     'Copy of CDL',                     FALSE, 6, 'is_new_authority'),
        ('voided_check',                 'Voided Check',                    FALSE, 7, 'uses_quick_pay')
    `);

    await client.query('COMMIT');
    console.log('✓ Migration complete: trucker document types reworked');
    console.log('  - Added condition_flag column to trucker_document_types');
    console.log('  - Added uses_factoring, is_new_authority, uses_quick_pay to truckers');
    console.log('  - Inserted 7 new document types (4 required, 3 conditional)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
