// PR 1 of the dispatcher-split rollout.
// - Adds two new columns to truckers: assigned_sales_agent_id and
//   assigned_dispatcher_id. Both nullable; both reference employees(id).
// - Backfills from the legacy single-slot assigned_agent_id based on the
//   assignee's employee_type:
//     sales_agent           -> assigned_sales_agent_id
//     dispatcher            -> assigned_dispatcher_id
//     sales_and_dispatcher  -> assigned_sales_agent_id (admin can add the
//                              dispatch half manually later — confirmed default)
//     admin / other         -> assigned_sales_agent_id (rare case, same default)
//
// IMPORTANT: this script does NOT drop the legacy assigned_agent_id column.
// We keep it populated and authoritative until PR 2 migrates every reader
// (UI, list joins) to the new columns. PR 3 will drop it once we're confident
// no readers remain.
import dotenv from 'dotenv';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');
dotenv.config();

import pool, { query } from '../src/config/database';

async function migrate() {
  try {
    await query(`ALTER TABLE truckers ADD COLUMN IF NOT EXISTS assigned_sales_agent_id UUID REFERENCES employees(id)`);
    await query(`ALTER TABLE truckers ADD COLUMN IF NOT EXISTS assigned_dispatcher_id UUID REFERENCES employees(id)`);
    console.log('Added columns: assigned_sales_agent_id, assigned_dispatcher_id');

    // Backfill: everyone EXCEPT pure dispatchers -> sales slot.
    // Using "<> 'dispatcher'" instead of an explicit IN list avoids tripping
    // over employee_type enum values that may exist in some deployments but
    // not others (e.g. 'admin' isn't a member of the enum in current prod).
    const salesResult = await query(`
      UPDATE truckers t
         SET assigned_sales_agent_id = t.assigned_agent_id
        FROM employees e
       WHERE t.assigned_agent_id = e.id
         AND t.assigned_sales_agent_id IS NULL
         AND e.employee_type <> 'dispatcher'
    `);
    console.log(`Backfilled assigned_sales_agent_id: ${salesResult.rowCount} rows`);

    // Backfill: pure dispatchers -> dispatcher slot
    const dispatchResult = await query(`
      UPDATE truckers t
         SET assigned_dispatcher_id = t.assigned_agent_id
        FROM employees e
       WHERE t.assigned_agent_id = e.id
         AND t.assigned_dispatcher_id IS NULL
         AND e.employee_type = 'dispatcher'
    `);
    console.log(`Backfilled assigned_dispatcher_id: ${dispatchResult.rowCount} rows`);

    // Sanity: how many truckers still have only the legacy field populated
    // but neither new slot filled? (Happens if assigned_agent_id points to a
    // deleted employee, or to an employee whose type is something we don't map.)
    const unmappedResult = await query(`
      SELECT COUNT(*)::int AS n
        FROM truckers t
       WHERE t.assigned_agent_id IS NOT NULL
         AND t.assigned_sales_agent_id IS NULL
         AND t.assigned_dispatcher_id IS NULL
    `);
    const unmapped = unmappedResult.rows[0]?.n ?? 0;
    if (unmapped > 0) {
      console.warn(`⚠ ${unmapped} trucker(s) had assigned_agent_id but no matching employee — left unmapped, please reassign manually`);
    } else {
      console.log('All legacy assignments mapped cleanly.');
    }

    console.log('\nDone.');
  } catch (err: any) {
    console.error('Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
