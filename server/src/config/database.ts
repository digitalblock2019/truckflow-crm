import { Pool, QueryResult } from 'pg';
import dns from 'dns';
import dotenv from 'dotenv';

dotenv.config();

// Force IPv4 — Render defaults to IPv6 which Supabase doesn't support
dns.setDefaultResultOrder('ipv4first');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export async function query(text: string, params?: unknown[]): Promise<QueryResult> {
  return pool.query(text, params);
}

export default pool;
