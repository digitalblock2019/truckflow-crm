import { query } from '../src/config/database';
import dotenv from 'dotenv';

dotenv.config();

// Match test users created with the +alias gmail trick (83.mumair+something@gmail.com)
const EMAIL_PATTERN = '83.mumair+%@gmail.com';

const DRY_RUN = process.argv.includes('--dry-run') || !process.argv.includes('--apply');

async function main() {
  console.log('=== Delete Test Employees ===');
  console.log(DRY_RUN ? '[DRY RUN — no deletions, pass --apply to execute]\n' : '[APPLYING — deletions will happen]\n');

  // 1. Find target employees by email pattern (personal_email or linked user email)
  const targets = await query(
    `SELECT e.id as employee_id, e.full_name, e.personal_email, e.employment_status, e.crm_user_id, u.email as user_email
     FROM employees e
     LEFT JOIN users u ON u.id = e.crm_user_id
     WHERE e.personal_email LIKE $1 OR u.email LIKE $1`,
    [EMAIL_PATTERN]
  );

  if (!targets.rows.length) {
    console.log('No matching test employees found.');
    process.exit(0);
  }

  console.log('Found these test employees:');
  for (const t of targets.rows) {
    console.log(`  - ${t.full_name} | ${t.user_email || t.personal_email} | status: ${t.employment_status} | user_id: ${t.crm_user_id || 'none'}`);
  }
  console.log('');

  // 2. Check for blocking references
  const blockers: string[] = [];
  for (const t of targets.rows) {
    const eid = t.employee_id;
    const uid = t.crm_user_id;

    const [loadsAsDispatcher, loadsAsAgent, comms, threshold] = await Promise.all([
      query(`SELECT count(*) FROM load_orders WHERE dispatcher_id = $1`, [eid]),
      query(`SELECT count(*) FROM load_orders WHERE sales_agent_id = $1`, [eid]),
      query(`SELECT count(*) FROM commissions WHERE employee_id = $1`, [eid]),
      query(`SELECT count(*) FROM agent_commission_thresholds WHERE agent_employee_id = $1`, [eid]),
    ]);

    const ld = parseInt(loadsAsDispatcher.rows[0].count);
    const la = parseInt(loadsAsAgent.rows[0].count);
    const c = parseInt(comms.rows[0].count);
    const th = parseInt(threshold.rows[0].count);

    console.log(`  Refs for ${t.full_name}:`);
    console.log(`    load_orders as dispatcher: ${ld}`);
    console.log(`    load_orders as sales_agent: ${la}`);
    console.log(`    commissions: ${c}`);
    console.log(`    commission thresholds: ${th}`);

    if (ld > 0) blockers.push(`${t.full_name} is dispatcher on ${ld} load(s) — load_orders.dispatcher_id is NOT NULL, can't be cleared`);

    if (uid) {
      const [audit, notif, msg] = await Promise.all([
        query(`SELECT count(*) FROM audit_log WHERE user_id = $1`, [uid]),
        query(`SELECT count(*) FROM notifications WHERE recipient_id = $1`, [uid]),
        query(`SELECT count(*) FROM chat_messages WHERE sender_id = $1`, [uid]),
      ]);
      console.log(`    audit_log entries: ${audit.rows[0].count}`);
      console.log(`    notifications: ${notif.rows[0].count}`);
      console.log(`    chat messages sent: ${msg.rows[0].count}`);
    }
    console.log('');
  }

  if (blockers.length > 0) {
    console.log('BLOCKED — fix these first:');
    blockers.forEach((b) => console.log(`  ✗ ${b}`));
    console.log('\nFor blocked load_orders, you can either delete those test loads first or reassign their dispatcher.');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('Dry run complete. Re-run with --apply to actually delete.');
    process.exit(0);
  }

  // 3. Apply deletes per employee
  for (const t of targets.rows) {
    const eid = t.employee_id;
    const uid = t.crm_user_id;
    console.log(`Deleting ${t.full_name}...`);

    // Null out optional FKs from employees that don't cascade
    await query(`UPDATE load_orders SET sales_agent_id = NULL WHERE sales_agent_id = $1`, [eid]);
    await query(`DELETE FROM commissions WHERE employee_id = $1`, [eid]);
    await query(`DELETE FROM agent_commission_thresholds WHERE agent_employee_id = $1`, [eid]);

    // User-related cleanup (if linked CRM account exists)
    if (uid) {
      await query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [uid]);
      await query(`DELETE FROM notifications WHERE recipient_id = $1`, [uid]);
      await query(`DELETE FROM chat_message_reactions WHERE user_id = $1`, [uid]);
      await query(`DELETE FROM chat_member_state WHERE user_id = $1`, [uid]);
      await query(`DELETE FROM chat_members WHERE user_id = $1`, [uid]);
      await query(`DELETE FROM chat_messages WHERE sender_id = $1`, [uid]);
      await query(`DELETE FROM audit_log WHERE user_id = $1`, [uid]);
      // Break the bidirectional link before deleting the user
      await query(`UPDATE employees SET crm_user_id = NULL WHERE crm_user_id = $1`, [uid]);
      await query(`DELETE FROM users WHERE id = $1`, [uid]);
    }

    // Employee delete cascades: pay_history, bank_details, leave_requests, performance_notes, hr_documents
    await query(`DELETE FROM employees WHERE id = $1`, [eid]);
    console.log(`  ✓ Deleted ${t.full_name}`);
  }

  console.log('\n=== Done ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
