import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import { query } from '../src/config/database';

async function seed() {
  console.log('Seeding TruckFlow CRM database...\n');

  const password = await bcrypt.hash('Password123!', 10);

  // ── Users + Employees ──────────────────────────────────────────────────

  // 1. Admin (no employee record — pure admin account)
  const admin = await upsertUser({
    email: 'admin@truckflow.com',
    full_name: 'Admin User',
    role: 'admin',
    password_hash: password,
  });
  console.log('  + Admin user:', admin.email);

  // 2. Supervisor + employee
  const supEmp = await upsertEmployee({
    full_name: 'Sarah Khan',
    personal_email: 'sarah.khan@personal.com',
    phone: '+1-555-0201',
    employee_type: 'fixed_salary',
    pay_type: 'salary_only',
    base_salary_pkr_paisa: 15000000, // 150,000 PKR
    pay_frequency: 'monthly',
    job_title: 'Operations Supervisor',
    department: 'Operations',
    start_date: '2024-06-01',
  });
  const supUser = await upsertUser({
    email: 'supervisor@truckflow.com',
    full_name: 'Sarah Khan',
    role: 'supervisor',
    password_hash: password,
    employee_id: supEmp.id,
  });
  await query('UPDATE employees SET crm_user_id = $1 WHERE id = $2', [supUser.id, supEmp.id]);
  console.log('  + Supervisor:', supUser.email);

  // 3. Sales Agent 1 + employee
  const agent1Emp = await upsertEmployee({
    full_name: 'Ali Ahmed',
    personal_email: 'ali.ahmed@personal.com',
    phone: '+1-555-0301',
    employee_type: 'sales_agent',
    pay_type: 'salary_plus_commission',
    base_salary_pkr_paisa: 8000000, // 80,000 PKR
    pay_frequency: 'monthly',
    commission_type: 'percentage',
    commission_value: 0.1, // 10%
    job_title: 'Sales Agent',
    department: 'Sales',
    start_date: '2025-01-15',
  });
  const agent1User = await upsertUser({
    email: 'agent1@truckflow.com',
    full_name: 'Ali Ahmed',
    role: 'sales_agent',
    password_hash: password,
    employee_id: agent1Emp.id,
  });
  await query('UPDATE employees SET crm_user_id = $1 WHERE id = $2', [agent1User.id, agent1Emp.id]);
  console.log('  + Sales Agent 1:', agent1User.email);

  // 4. Sales Agent 2 + employee
  const agent2Emp = await upsertEmployee({
    full_name: 'Fatima Malik',
    personal_email: 'fatima.malik@personal.com',
    phone: '+1-555-0302',
    employee_type: 'sales_agent',
    pay_type: 'commission_only',
    commission_type: 'percentage',
    commission_value: 0.12, // 12%
    job_title: 'Senior Sales Agent',
    department: 'Sales',
    start_date: '2024-09-01',
  });
  const agent2User = await upsertUser({
    email: 'agent2@truckflow.com',
    full_name: 'Fatima Malik',
    role: 'sales_agent',
    password_hash: password,
    employee_id: agent2Emp.id,
  });
  await query('UPDATE employees SET crm_user_id = $1 WHERE id = $2', [agent2User.id, agent2Emp.id]);
  console.log('  + Sales Agent 2:', agent2User.email);

  // 5. Dispatcher + employee
  const dispEmp = await upsertEmployee({
    full_name: 'Omar Rashid',
    personal_email: 'omar.rashid@personal.com',
    phone: '+1-555-0401',
    employee_type: 'dispatcher',
    pay_type: 'salary_plus_commission',
    base_salary_pkr_paisa: 10000000, // 100,000 PKR
    pay_frequency: 'monthly',
    commission_type: 'percentage',
    commission_value: 0.05, // 5%
    job_title: 'Dispatcher',
    department: 'Dispatch',
    start_date: '2025-03-01',
  });
  const dispUser = await upsertUser({
    email: 'dispatcher@truckflow.com',
    full_name: 'Omar Rashid',
    role: 'dispatcher',
    password_hash: password,
    employee_id: dispEmp.id,
  });
  await query('UPDATE employees SET crm_user_id = $1 WHERE id = $2', [dispUser.id, dispEmp.id]);
  console.log('  + Dispatcher:', dispUser.email);

  // 6. Viewer
  const viewerUser = await upsertUser({
    email: 'viewer@truckflow.com',
    full_name: 'View Only User',
    role: 'viewer',
    password_hash: password,
  });
  console.log('  + Viewer:', viewerUser.email);

  // ── Truckers ───────────────────────────────────────────────────────────

  const truckers = [
    { mc_number: 'MC-100001', legal_name: 'Fast Lane Trucking LLC', dba_name: 'Fast Lane', phone: '+1-555-1001', email: 'dispatch@fastlane.com', truck_type: 'Dry Van', state: 'TX', status_system: 'onboarded', assigned_agent_id: agent1Emp.id, company_commission_pct: 0.08 },
    { mc_number: 'MC-100002', legal_name: 'Eagle Transport Inc', dba_name: null, phone: '+1-555-1002', email: 'ops@eagletransport.com', truck_type: 'Flatbed', state: 'CA', status_system: 'interested', assigned_agent_id: agent1Emp.id, company_commission_pct: 0.07 },
    { mc_number: 'MC-100003', legal_name: 'Midwest Carriers Corp', dba_name: 'Midwest Carriers', phone: '+1-555-1003', email: 'info@midwestcarriers.com', truck_type: 'Reefer', state: 'IL', status_system: 'called', assigned_agent_id: agent2Emp.id, company_commission_pct: 0.08 },
    { mc_number: 'MC-100004', legal_name: 'Summit Freight Solutions', dba_name: null, phone: '+1-555-1004', email: 'contact@summitfreight.com', truck_type: 'Dry Van', state: 'FL', status_system: 'onboarded', assigned_agent_id: agent2Emp.id, company_commission_pct: 0.09 },
    { mc_number: 'MC-100005', legal_name: 'Pacific Coast Logistics', dba_name: 'PCL', phone: '+1-555-1005', email: 'hello@pcllogistics.com', truck_type: 'Flatbed', state: 'WA', status_system: 'sms_sent', assigned_agent_id: null, company_commission_pct: 0.08 },
  ];

  const truckerIds: string[] = [];
  for (const t of truckers) {
    const existing = await query('SELECT id FROM truckers WHERE mc_number = $1', [t.mc_number]);
    if (existing.rows.length) {
      truckerIds.push(existing.rows[0].id);
      console.log(`  ~ Trucker ${t.mc_number} already exists`);
      continue;
    }
    const result = await query(
      `INSERT INTO truckers (mc_number, legal_name, dba_name, phone, email, truck_type, state,
       status_system, assigned_agent_id, company_commission_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [t.mc_number, t.legal_name, t.dba_name, t.phone, t.email, t.truck_type, t.state,
       t.status_system, t.assigned_agent_id, t.company_commission_pct]
    );
    truckerIds.push(result.rows[0].id);
    console.log(`  + Trucker: ${t.mc_number} — ${t.legal_name}`);
  }

  // ── Commission Thresholds (for onboarded truckers with agents) ─────────

  const defaultThreshold = 3;
  for (let i = 0; i < truckers.length; i++) {
    const t = truckers[i];
    if (t.assigned_agent_id && t.status_system === 'onboarded') {
      const exists = await query(
        'SELECT id FROM agent_commission_thresholds WHERE trucker_id = $1 AND agent_employee_id = $2',
        [truckerIds[i], t.assigned_agent_id]
      );
      if (!exists.rows.length) {
        await query(
          `INSERT INTO agent_commission_thresholds (trucker_id, agent_employee_id, threshold_loads, set_by)
           VALUES ($1, $2, $3, $4)`,
          [truckerIds[i], t.assigned_agent_id, defaultThreshold, admin.id]
        );
        console.log(`  + Threshold: ${t.mc_number} → ${defaultThreshold} loads`);
      }
    }
  }

  // ── Shippers ───────────────────────────────────────────────────────────

  const shippers = [
    { company_name: 'Global Freight Partners', contact_name: 'John Smith', email: 'john@globalfreight.com', phone: '+1-555-2001', source: 'dat_load_board' },
    { company_name: 'DAT Load Board Direct', contact_name: 'Lisa Wang', email: 'lisa@datdirect.com', phone: '+1-555-2002', source: 'dat_load_board' },
    { company_name: 'American Supply Co', contact_name: 'Mike Johnson', email: 'mike@americansupply.com', phone: '+1-555-2003', source: 'direct' },
  ];

  const shipperIds: string[] = [];
  for (const s of shippers) {
    const existing = await query('SELECT id FROM shippers WHERE email = $1', [s.email]);
    if (existing.rows.length) {
      shipperIds.push(existing.rows[0].id);
      console.log(`  ~ Shipper ${s.company_name} already exists`);
      continue;
    }
    const result = await query(
      `INSERT INTO shippers (company_name, contact_name, email, phone, source, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [s.company_name, s.contact_name, s.email, s.phone, s.source, admin.id]
    );
    shipperIds.push(result.rows[0].id);
    console.log(`  + Shipper: ${s.company_name}`);
  }

  // ── Load Orders ────────────────────────────────────────────────────────

  // Only create loads for onboarded truckers (index 0, 3)
  const loads = [
    { trucker_idx: 0, origin: 'Dallas, TX', dest: 'Houston, TX', gross_cents: 250000, shipper_idx: 0 },
    { trucker_idx: 0, origin: 'Houston, TX', dest: 'San Antonio, TX', gross_cents: 180000, shipper_idx: 1 },
    { trucker_idx: 3, origin: 'Miami, FL', dest: 'Orlando, FL', gross_cents: 150000, shipper_idx: 2 },
    { trucker_idx: 3, origin: 'Tampa, FL', dest: 'Jacksonville, FL', gross_cents: 320000, shipper_idx: 0 },
  ];

  for (const l of loads) {
    const truckerId = truckerIds[l.trucker_idx];
    const trucker = truckers[l.trucker_idx];
    const companyPct = trucker.company_commission_pct;
    const companyGross = Math.round(l.gross_cents * companyPct);
    const agentId = trucker.assigned_agent_id;

    // Get agent commission
    let agentPct = 0, agentComm = 0;
    if (agentId) {
      const agentRow = await query('SELECT commission_value FROM employees WHERE id = $1', [agentId]);
      agentPct = parseFloat(agentRow.rows[0]?.commission_value || '0');
      agentComm = Math.round(companyGross * agentPct);
    }

    // Dispatcher commission
    const dispPct = parseFloat((await query('SELECT commission_value FROM employees WHERE id = $1', [dispEmp.id])).rows[0]?.commission_value || '0');
    const dispComm = Math.round(companyGross * dispPct);
    const companyNet = companyGross - agentComm - dispComm;

    const existing = await query(
      'SELECT id FROM load_orders WHERE trucker_id = $1 AND load_origin = $2 AND load_destination = $3 AND gross_load_amount_cents = $4',
      [truckerId, l.origin, l.dest, l.gross_cents]
    );
    if (existing.rows.length) {
      console.log(`  ~ Load ${l.origin} → ${l.dest} already exists`);
      continue;
    }

    const loadResult = await query(
      `INSERT INTO load_orders (trucker_id, load_origin, load_destination, gross_load_amount_cents,
       company_commission_pct, sales_agent_id, agent_commission_pct, agent_commission_cents,
       agent_eligibility, dispatcher_id, dispatcher_commission_pct, dispatcher_commission_cents,
       company_net_cents, shipper_id, load_status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id, order_number`,
      [truckerId, l.origin, l.dest, l.gross_cents, companyPct,
       agentId, agentPct, agentComm, agentId ? 'eligible' : 'not_applicable',
       dispEmp.id, dispPct, dispComm, companyNet, shipperIds[l.shipper_idx],
       'pending', admin.id]
    );

    const loadId = loadResult.rows[0].id;
    console.log(`  + Load: ${loadResult.rows[0].order_number} — $${(l.gross_cents / 100).toFixed(2)} (${l.origin} → ${l.dest})`);

    // Create commission records
    if (dispComm > 0) {
      await query('INSERT INTO commissions (load_order_id, employee_id, employee_type, amount_cents) VALUES ($1,$2,$3,$4)',
        [loadId, dispEmp.id, 'dispatcher', dispComm]);
    }
    if (agentComm > 0 && agentId) {
      await query('INSERT INTO commissions (load_order_id, employee_id, employee_type, amount_cents) VALUES ($1,$2,$3,$4)',
        [loadId, agentId, 'sales_agent', agentComm]);
    }
  }

  // ── Invoice Branding ───────────────────────────────────────────────────

  const brandingExists = await query('SELECT id FROM invoice_branding LIMIT 1');
  if (!brandingExists.rows.length) {
    await query(
      `INSERT INTO invoice_branding (company_name, company_address, company_phone, company_email, invoice_footer_text, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      ['TruckFlow Logistics', '123 Commerce Drive, Suite 400, Dallas, TX 75201', '+1-555-0100',
       'billing@truckflow.com', 'Thank you for your business!', admin.id]
    );
    console.log('  + Invoice branding set');
  }

  // ── Summary ────────────────────────────────────────────────────────────

  console.log('\n========================================');
  console.log('  Seed complete!');
  console.log('========================================');
  console.log('\n  Login credentials (all same password):');
  console.log('  Password: Password123!\n');
  console.log('  admin@truckflow.com       (Admin)');
  console.log('  supervisor@truckflow.com   (Supervisor)');
  console.log('  agent1@truckflow.com       (Sales Agent)');
  console.log('  agent2@truckflow.com       (Sales Agent)');
  console.log('  dispatcher@truckflow.com   (Dispatcher)');
  console.log('  viewer@truckflow.com       (Viewer)');
  console.log('');

  process.exit(0);
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function upsertUser(data: any) {
  const existing = await query('SELECT * FROM users WHERE email = $1', [data.email]);
  if (existing.rows.length) {
    await query('UPDATE users SET password_hash = $1, is_active = TRUE WHERE id = $2', [data.password_hash, existing.rows[0].id]);
    return existing.rows[0];
  }
  const result = await query(
    `INSERT INTO users (email, full_name, role, password_hash, employee_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.email, data.full_name, data.role, data.password_hash, data.employee_id || null]
  );
  return result.rows[0];
}

async function upsertEmployee(data: any) {
  const existing = await query('SELECT * FROM employees WHERE personal_email = $1', [data.personal_email]);
  if (existing.rows.length) return existing.rows[0];

  const result = await query(
    `INSERT INTO employees (full_name, personal_email, phone, employee_type, pay_type,
     base_salary_pkr_paisa, pay_frequency, commission_type, commission_value,
     job_title, department, start_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [data.full_name, data.personal_email, data.phone, data.employee_type, data.pay_type,
     data.base_salary_pkr_paisa || null, data.pay_frequency || null,
     data.commission_type || null, data.commission_value || null,
     data.job_title, data.department, data.start_date]
  );
  return result.rows[0];
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
