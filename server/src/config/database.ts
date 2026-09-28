import { Pool, QueryResult } from 'pg';
import dns from 'dns';
import dotenv from 'dotenv';

dotenv.config();

// Force IPv4 — Render defaults to IPv6 which Supabase doesn't support
dns.setDefaultResultOrder('ipv4first');

// Supabase requires SSL; the Dockerised test Postgres doesn't support it at
// all and rejects every statement when it's forced on. Detect a local target
// rather than making each environment set another variable.
const isLocalDb = /@(localhost|127\.0\.0\.1|postgres-test)[:/]/.test(process.env.DATABASE_URL || '');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export async function query(text: string, params?: unknown[]): Promise<QueryResult> {
  return pool.query(text, params);
}

export default pool;
