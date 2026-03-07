/**
 * Migration: Create load_documents table for per-load document management
 * - Supports 3 doc types: rate_con, bol, pod
 * - UNIQUE constraint on (load_order_id, doc_type)
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS load_documents (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        load_order_id UUID NOT NULL REFERENCES load_orders(id) ON DELETE CASCADE,
        doc_type      TEXT NOT NULL CHECK (doc_type IN ('rate_con', 'bol', 'pod')),
        file_name     TEXT NOT NULL,
        file_path     TEXT NOT NULL,
        file_size_bytes BIGINT,
        mime_type     TEXT,
        uploaded_by   UUID REFERENCES users(id),
        uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (load_order_id, doc_type)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_load_documents_load_order_id ON load_documents(load_order_id)
    `);

    await client.query('COMMIT');
    console.log('✓ Migration complete: load_documents table created');
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
