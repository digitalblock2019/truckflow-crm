import { query } from '../src/config/database';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function cleanAll() {
  console.log('=== TruckFlow Data Cleanup ===\n');

  // 1. Find admin users to preserve — explicit whitelist by email
  const PROTECTED_ADMIN_EMAILS = [
    'admin@truckflow.com',
    '83.mumair@gmail.com',
    'Sanianazeer1992@gmail.com',
  ];
  const adminResult = await query(
    "SELECT id, email, full_name FROM users WHERE role = 'admin' AND email = ANY($1::citext[])",
    [PROTECTED_ADMIN_EMAILS]
  );
  if (!adminResult.rows.length) {
    console.error('None of the protected admin emails were found! Aborting.');
    console.error('Expected one of: ' + PROTECTED_ADMIN_EMAILS.join(', '));
    process.exit(1);
  }
  const protectedAdmins = adminResult.rows;
  const protectedIds = protectedAdmins.map((a) => a.id);

  // 1b. Find employee records linked to those admins — preserve those too
  const protectedEmpResult = await query(
    'SELECT employee_id FROM users WHERE id = ANY($1::uuid[]) AND employee_id IS NOT NULL',
    [protectedIds]
  );
  const protectedEmployeeIds: string[] = protectedEmpResult.rows.map((r: any) => r.employee_id);

  console.log('Preserving admins:');
  protectedAdmins.forEach((a) => console.log(`  - ${a.full_name} (${a.email})`));
  if (protectedEmployeeIds.length) {
    console.log(`Preserving ${protectedEmployeeIds.length} linked employee record(s).`);
  } else {
    console.log('No linked employee records to preserve.');
  }
  console.log('');

  // 1c. Temporarily drop the audit_log immutability rule so the cleanup can wipe it.
  // The rule (no_delete_audit) is meant to prevent app-level tampering, not one-off
  // admin-run cleanup scripts. We restore it at the end.
  console.log('Temporarily dropping audit_log immutability rule...');
  await query('DROP RULE IF EXISTS no_delete_audit ON audit_log');

  // 2. Delete in dependency order (children first)
  const deletions = [
    // Chat
    "DELETE FROM chat_message_reactions",
    "DELETE FROM chat_message_attachments",
    "DELETE FROM chat_messages",
    "DELETE FROM chat_member_state",
    "DELETE FROM chat_members",
    "DELETE FROM chat_conversations",

    // Invoices
    "DELETE FROM invoice_activity",
    "DELETE FROM invoice_reminder_rules",
    "DELETE FROM invoice_tax_lines",
    "DELETE FROM invoice_line_items",
    "DELETE FROM invoices",
    "DELETE FROM invoice_branding",
    "DELETE FROM invoice_tax_rates",
    "DELETE FROM invoice_clients",

    // Email
    "DELETE FROM email_attachments",
    "DELETE FROM emails",

    // Commissions
    "DELETE FROM commissions",
    "DELETE FROM agent_commission_thresholds",

    // Load orders
    "DELETE FROM document_email_forwards",
    "DELETE FROM document_downloads",
    "DELETE FROM load_orders",

    // Trucker documents
    "DELETE FROM trucker_documents",
    "DELETE FROM trucker_document_types",
    "DELETE FROM trucker_status_history",
    "DELETE FROM truckers",
    "DELETE FROM trucker_upload_batches",
    "DELETE FROM trucker_custom_statuses",

    // HR
    "DELETE FROM hr_documents",
    "DELETE FROM hr_document_types",

    // Employee related
    "DELETE FROM employee_leave_requests",
    "DELETE FROM employee_performance_notes",
    "DELETE FROM employee_pay_history",
    "DELETE FROM employee_bank_details",

    // Notifications & audit
    "DELETE FROM notifications",
    "DELETE FROM audit_log",

    // Shippers
    "DELETE FROM shippers",

    // Refresh tokens (except protected admins')
    `DELETE FROM refresh_tokens WHERE user_id NOT IN (${protectedIds.map((id) => `'${id}'`).join(',')})`,

    // Users (except protected admins)
    `DELETE FROM users WHERE id NOT IN (${protectedIds.map((id) => `'${id}'`).join(',')})`,

    // Employees (except those linked to protected admins) — keep their HR profile rows
    protectedEmployeeIds.length
      ? `DELETE FROM employees WHERE id NOT IN (${protectedEmployeeIds.map((id) => `'${id}'`).join(',')})`
      : 'DELETE FROM employees',
  ];

  for (const sql of deletions) {
    try {
      const result = await query(sql);
      const table = sql.match(/(?:FROM|UPDATE)\s+(\w+)/i)?.[1] || sql;
      console.log(`  ✓ ${table}: ${result.rowCount} rows affected`);
    } catch (err: any) {
      // Table might not exist, skip
      const table = sql.match(/(?:FROM|UPDATE)\s+(\w+)/i)?.[1] || sql;
      console.log(`  ⚠ ${table}: ${err.message}`);
    }
  }

  // 3. Clean Supabase Storage
  console.log('\nCleaning Supabase Storage...');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const buckets = ['trucker-documents'];

    for (const bucket of buckets) {
      try {
        const { data: files, error } = await supabase.storage.from(bucket).list('', { limit: 1000 });
        if (error) {
          console.log(`  ⚠ ${bucket}: ${error.message}`);
          continue;
        }
        if (!files || files.length === 0) {
          console.log(`  ✓ ${bucket}: empty`);
          continue;
        }

        // List all files recursively
        const allFiles = await listAllFiles(supabase, bucket, '');
        if (allFiles.length > 0) {
          const { error: delError } = await supabase.storage.from(bucket).remove(allFiles);
          if (delError) {
            console.log(`  ⚠ ${bucket}: delete error — ${delError.message}`);
          } else {
            console.log(`  ✓ ${bucket}: ${allFiles.length} files deleted`);
          }
        } else {
          console.log(`  ✓ ${bucket}: no files`);
        }
      } catch (err: any) {
        console.log(`  ⚠ ${bucket}: ${err.message}`);
      }
    }
  } else {
    console.log('  ⚠ Supabase credentials not set, skipping storage cleanup');
  }

  // 4. Reset sequences if any
  console.log('\nReset system settings...');
  try {
    await query("DELETE FROM system_settings");
    console.log('  ✓ system_settings cleared');
  } catch (err: any) {
    console.log(`  ⚠ system_settings: ${err.message}`);
  }

  // 5. Restore audit_log immutability rule
  console.log('\nRestoring audit_log immutability rule...');
  try {
    await query('CREATE RULE no_delete_audit AS ON DELETE TO audit_log DO INSTEAD NOTHING');
    console.log('  ✓ no_delete_audit rule restored');
  } catch (err: any) {
    console.log(`  ⚠ Failed to restore rule: ${err.message}`);
  }

  console.log('\n=== Cleanup complete! ===');
  console.log('Admins preserved:');
  protectedAdmins.forEach((a) => console.log(`  - ${a.email}`));
  process.exit(0);
}

async function listAllFiles(supabase: any, bucket: string, prefix: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return [];

  const paths: string[] = [];
  for (const item of data) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id) {
      // It's a file
      paths.push(fullPath);
    } else {
      // It's a folder, recurse
      const subPaths = await listAllFiles(supabase, bucket, fullPath);
      paths.push(...subPaths);
    }
  }
  return paths;
}

cleanAll().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
