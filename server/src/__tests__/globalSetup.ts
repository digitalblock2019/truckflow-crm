import dotenv from 'dotenv';
import path from 'path';

// Load the test environment BEFORE importing anything that touches database.ts
// (so the pg pool reads DATABASE_URL pointing at the Docker test DB).
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

import bcrypt from 'bcryptjs';
import pool, { query } from '../config/database';
import { runSchema } from '../../scripts/runSchema';

// Test seed data — every integration test can assume these exist.
export const TEST_USERS = {
  admin: {
    email: 'admin@truckflow.com',
    password: 'Password123!',
    role: 'admin' as const,
    full_name: 'Test Admin',
  },
  rep: {
    email: 'rep@truckflow.com',
    password: 'Password123!',
    role: 'sales_agent' as const,
    full_name: 'Test Rep',
  },
  dispatcher: {
    email: 'dispatcher@truckflow.com',
    password: 'Password123!',
    role: 'dispatcher' as const,
    full_name: 'Test Dispatcher',
  },
};

async function waitForDb(maxAttempts = 30, intervalMs = 500): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await query('SELECT 1');
      return;
    } catch (err) {
      if (i === maxAttempts - 1) {
        throw new Error(
          `Test database not reachable at ${process.env.DATABASE_URL}. ` +
          `Start it with: npm run test:db:up`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
}

async function isAlreadySeeded(): Promise<boolean> {
  try {
    const r = await query(
      'SELECT 1 FROM users WHERE email = $1 LIMIT 1',
      [TEST_USERS.admin.email]
    );
    return r.rows.length > 0;
  } catch {
    // Table doesn't exist yet — needs schema applied.
    return false;
  }
}

async function wipeData(): Promise<void> {
  // Tables we touch in tests — TRUNCATE CASCADE wipes related rows in one shot.
  // Order doesn't matter with CASCADE. Schema definitions stay intact.
  const tables = [
    'audit_log', 'commissions', 'load_orders',
    'trucker_status_history', 'agent_commission_thresholds',
    'trucker_documents', 'truckers',
    'invoice_line_items', 'invoice_tax_lines', 'invoice_activity', 'invoices',
    'refresh_tokens', 'notifications',
    'employee_pay_history',
  ];
  for (const t of tables) {
    try {
      await query(`TRUNCATE ${t} RESTART IDENTITY CASCADE`);
    } catch {
      // Table may not exist yet on first run — schema runs next.
    }
  }
  // Keep test users; wipe non-test ones.
  const testEmails = Object.values(TEST_USERS).map((u) => u.email);
  try {
    await query(
      `DELETE FROM users WHERE email <> ALL($1::text[])`,
      [testEmails],
    );
    await query(
      `DELETE FROM employees WHERE id NOT IN (SELECT employee_id FROM users WHERE employee_id IS NOT NULL)`
    );
  } catch {
    // Not seeded yet — fine.
  }
}

async function seedUsers(): Promise<void> {
  for (const user of Object.values(TEST_USERS)) {
    const hash = await bcrypt.hash(user.password, 8); // low rounds = fast tests
    await query(
      `INSERT INTO users (email, role, full_name, is_active, password_hash)
       VALUES ($1, $2, $3, TRUE, $4)
       ON CONFLICT (email) DO UPDATE SET
         role = EXCLUDED.role,
         full_name = EXCLUDED.full_name,
         is_active = TRUE,
         password_hash = EXCLUDED.password_hash`,
      [user.email, user.role, user.full_name, hash],
    );
  }
}

export default async function globalSetup(): Promise<void> {
  await waitForDb();

  const seeded = await isAlreadySeeded();
  if (!seeded) {
    // Fresh DB — apply schema. Suppress noisy output so test runs stay readable.
    await runSchema({ closePool: false, quiet: true });
  }

  // Always start each test run from a clean data slate (schema preserved).
  await wipeData();
  await seedUsers();

  // The setup process is its own Node — close the pool so it can exit cleanly.
  // Each test worker creates its own pool when it imports database.ts.
  await pool.end();
}
