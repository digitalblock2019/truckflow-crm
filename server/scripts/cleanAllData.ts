import { query } from '../src/config/database';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function cleanAll() {
  console.log('=== TruckFlow Data Cleanup ===\n');

  // 1. Find admin user to preserve
  const adminResult = await query("SELECT id, email, full_name FROM users WHERE role = 'admin' LIMIT 1");
  if (!adminResult.rows.length) {
    console.error('No admin user found! Aborting.');
    process.exit(1);
  }
  const admin = adminResult.rows[0];
  console.log(`Preserving admin: ${admin.full_name} (${admin.email})\n`);

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

    // Refresh tokens (except admin's)
    `DELETE FROM refresh_tokens WHERE user_id != '${admin.id}'`,

    // Users (except admin) — must come before employees if users reference employees
    `DELETE FROM users WHERE id != '${admin.id}'`,

    // Employees
    "DELETE FROM employees",

    // Clear admin's employee_id link since employees are gone
    `UPDATE users SET employee_id = NULL WHERE id = '${admin.id}'`,
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

  console.log('\n=== Cleanup complete! ===');
  console.log(`Admin user preserved: ${admin.email}`);
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
