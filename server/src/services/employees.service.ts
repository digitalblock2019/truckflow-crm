import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../config/database';
import { AppError } from '../utils/AppError';
import { EmailService } from './email.service';
import { NotificationsService } from './notifications.service';

const notifications = new NotificationsService();

export class EmployeesService {
  async list(filters: { status?: string; type?: string; search?: string; page?: number; limit?: number }) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters.status) { conditions.push(`e.employment_status = $${idx++}`); params.push(filters.status); }
    if (filters.type) { conditions.push(`e.employee_type = $${idx++}`); params.push(filters.type); }
    if (filters.search) { conditions.push(`(e.full_name ILIKE $${idx} OR e.employee_number ILIKE $${idx})`); params.push(`%${filters.search}%`); idx++; }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = filters.limit || 50;
    const offset = ((filters.page || 1) - 1) * limit;

    const countResult = await query(`SELECT count(*) FROM employees e ${where}`, params);
    const dataResult = await query(
      `SELECT e.*, u.email as crm_email, u.role as crm_role
       FROM employees e LEFT JOIN users u ON u.id = e.crm_user_id
       ${where} ORDER BY e.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    return { data: dataResult.rows, total: parseInt(countResult.rows[0].count), page: filters.page || 1, limit };
  }

  async getById(id: string, requestingUserId: string, requestingRole: string) {
    const employeeId = id === 'me' ? (await this.getEmployeeIdForUser(requestingUserId)) : id;
    if (!employeeId) throw new AppError('Employee not found', 404, 'NOT_FOUND');

    const result = await query(
      `SELECT e.*, u.email as crm_email, u.role as crm_role, u.last_login_at
       FROM employees e LEFT JOIN users u ON u.id = e.crm_user_id WHERE e.id = $1`, [employeeId]
    );
    if (!result.rows.length) throw new AppError('Employee not found', 404, 'NOT_FOUND');

    const employee = result.rows[0];
    // Agents can only view their own profile
    if (requestingRole === 'sales_agent' || requestingRole === 'dispatcher') {
      const myEmpId = await this.getEmployeeIdForUser(requestingUserId);
      if (myEmpId !== employeeId) throw new AppError('Access denied', 403, 'FORBIDDEN');
    }
    return employee;
  }

  async create(data: Record<string, any>, userId: string) {
    // Auto-generate employee number
    const lastNum = await query("SELECT employee_number FROM employees ORDER BY created_at DESC LIMIT 1");
    let nextNum = 'EMP-0001';
    if (lastNum.rows.length) {
      const match = lastNum.rows[0].employee_number.match(/EMP-(\d+)/);
      if (match) nextNum = `EMP-${String(parseInt(match[1]) + 1).padStart(4, '0')}`;
    }

    const result = await query(
      `INSERT INTO employees (employee_number, full_name, personal_email, phone, job_title, department,
       employee_type, start_date, pay_type, base_salary_pkr_paisa, commission_type, commission_value, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [nextNum, data.full_name, data.personal_email, data.phone, data.job_title, data.department,
       data.employee_type, data.start_date || null, data.pay_type || 'salary_only',
       data.base_salary_pkr_paisa || null, data.commission_type || null, data.commission_value || null, userId]
    );

    const employeeId = result.rows[0].id;

    // Create CRM user if email provided
    if (data.crm_email) {
      const password = data.crm_password || crypto.randomBytes(8).toString('base64url').slice(0, 12);
      const passwordHash = await bcrypt.hash(password, 12);
      const role = data.crm_role || 'viewer';

      const userResult = await query(
        `INSERT INTO users (email, full_name, role, employee_id, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [data.crm_email, data.full_name, role, employeeId, passwordHash]
      );

      // Link user to employee
      await query('UPDATE employees SET crm_user_id = $1 WHERE id = $2', [userResult.rows[0].id, employeeId]);
      result.rows[0].crm_user_id = userResult.rows[0].id;

      // Send welcome email
      try {
        const emailService = new EmailService();
        const loginUrl = `${process.env.APP_URL || 'http://localhost:3001'}/login`;
        await emailService.sendWelcomeEmail(data.crm_email, data.full_name, password, loginUrl);
      } catch (err) {
        console.error('[EmployeesService] Failed to send welcome email:', err);
      }
    }

    await query(
      `INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, description)
       VALUES ($1, (SELECT role FROM users WHERE id=$1), 'create', 'employee', $2, $3)`,
      [userId, employeeId, `Created employee: ${data.full_name} (${nextNum})${data.crm_email ? ' + CRM user' : ''}`]
    );

    return result.rows[0];
  }

  async update(id: string, data: Record<string, any>, userId: string) {
    const payFields = ['base_salary_pkr_paisa', 'commission_value', 'pay_frequency', 'pay_type', 'commission_type'];
    const existing = await query('SELECT * FROM employees WHERE id = $1', [id]);
    if (!existing.rows.length) throw new AppError('Employee not found', 404, 'NOT_FOUND');
    const old = existing.rows[0];

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
      // Track pay changes
      if (payFields.includes(key) && old[key] !== value) {
        await query(
          'INSERT INTO employee_pay_history (employee_id, field_changed, old_value, new_value, effective_date, changed_by) VALUES ($1,$2,$3,$4,$5,$6)',
          [id, key, String(old[key] ?? ''), String(value ?? ''), data.compensation_effective_date || new Date(), userId]
        );
      }
    }

    if (!fields.length) throw new AppError('No fields to update', 400, 'VALIDATION_ERROR');
    fields.push(`updated_at = NOW()`);
    values.push(id);

    await query(`UPDATE employees SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    return this.getById(id, userId, 'admin');
  }

  async getBankDetails(employeeId: string) {
    const result = await query(
      `SELECT id, employee_id, bank_name, account_holder, account_type, payment_method, currency, updated_at,
              pgp_sym_decrypt(account_number_encrypted, $2) as account_number,
              pgp_sym_decrypt(routing_number_encrypted, $2) as routing_number
       FROM employee_bank_details WHERE employee_id = $1`,
      [employeeId, process.env.BANK_ENCRYPTION_KEY || 'truckflow-bank-key']
    );
    if (!result.rows.length) throw new AppError('Bank details not found', 404, 'NOT_FOUND');
    return result.rows[0];
  }

  async updateBankDetails(employeeId: string, data: any, userId: string) {
    const key = process.env.BANK_ENCRYPTION_KEY || 'truckflow-bank-key';
    const existing = await query('SELECT id FROM employee_bank_details WHERE employee_id = $1', [employeeId]);

    if (existing.rows.length) {
      await query(
        `UPDATE employee_bank_details SET bank_name=$1, account_holder=$2,
         account_number_encrypted=pgp_sym_encrypt($3, $8), routing_number_encrypted=pgp_sym_encrypt($4, $8),
         account_type=$5, payment_method=$6, updated_by=$7, updated_at=NOW() WHERE employee_id=$9`,
        [data.bank_name, data.account_holder, data.account_number, data.routing_number,
         data.account_type, data.payment_method, userId, key, employeeId]
      );
    } else {
      await query(
        `INSERT INTO employee_bank_details (employee_id, bank_name, account_holder,
         account_number_encrypted, routing_number_encrypted, account_type, payment_method, updated_by)
         VALUES ($1,$2,$3,pgp_sym_encrypt($4,$9),pgp_sym_encrypt($5,$9),$6,$7,$8)`,
        [employeeId, data.bank_name, data.account_holder, data.account_number, data.routing_number,
         data.account_type, data.payment_method, userId, key]
      );
    }

    // Audit log
    await query(
      `INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, description)
       VALUES ($1, (SELECT role FROM users WHERE id=$1), 'bank_detail_change', 'employee', $2, 'Bank details updated')`,
      [userId, employeeId]
    );

    return { message: 'Bank details updated' };
  }

  async terminate(id: string, data: any, userId: string) {
    const emp = await query('SELECT * FROM employees WHERE id = $1', [id]);
    if (!emp.rows.length) throw new AppError('Employee not found', 404, 'NOT_FOUND');
    if (emp.rows[0].employment_status === 'terminated') throw new AppError('Already terminated', 422, 'ALREADY_TERMINATED');

    // 1. Update employee record
    await query(
      `UPDATE employees SET employment_status='terminated', termination_date=$1, termination_reason=$2,
       termination_notes=$3, final_settlement_pkr_paisa=$4, updated_at=NOW() WHERE id=$5`,
      [data.termination_date || new Date(), data.termination_reason, data.termination_notes,
       data.final_settlement_pkr_paisa, id]
    );

    // 2. Deactivate CRM user
    if (emp.rows[0].crm_user_id) {
      await query('UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [emp.rows[0].crm_user_id]);
    }

    // 3. Close commission thresholds
    await query(
      `UPDATE agent_commission_thresholds SET eligibility_status='agent_terminated', closed_reason='Employee terminated',
       closed_at=NOW(), updated_at=NOW() WHERE agent_employee_id=$1 AND eligibility_status='eligible'`, [id]
    );

    // 4. Audit log
    await query(
      `INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, description)
       VALUES ($1, (SELECT role FROM users WHERE id=$1), 'termination', 'employee', $2, $3)`,
      [userId, id, `Terminated: ${data.termination_reason || 'N/A'}`]
    );

    // 5. Notify admins
    try {
      await notifications.createForRole('admin', 'Employee terminated', `${emp.rows[0].full_name} has been terminated`, 'employee', id);
    } catch (err) { console.error('[EmployeesService] Notification error:', err); }

    return { message: 'Employee terminated successfully' };
  }

  async reinstate(id: string, userId: string) {
    const emp = await query('SELECT * FROM employees WHERE id = $1', [id]);
    if (!emp.rows.length) throw new AppError('Employee not found', 404, 'NOT_FOUND');
    if (emp.rows[0].employment_status !== 'terminated') throw new AppError('Employee is not terminated', 422, 'NOT_TERMINATED');

    // 1. Reactivate employee
    await query(
      `UPDATE employees SET employment_status = 'active', termination_date = NULL, termination_reason = NULL,
       termination_notes = NULL, updated_at = NOW() WHERE id = $1`,
      [id]
    );

    // 2. Re-activate CRM user if linked
    if (emp.rows[0].crm_user_id) {
      await query('UPDATE users SET is_active = TRUE, updated_at = NOW() WHERE id = $1', [emp.rows[0].crm_user_id]);
    }

    // 3. Audit log
    await query(
      `INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, description)
       VALUES ($1, (SELECT role FROM users WHERE id=$1), 'reinstate', 'employee', $2, $3)`,
      [userId, id, `Reinstated employee: ${emp.rows[0].full_name}`]
    );

    // 4. Notify admins
    try {
      await notifications.createForRole('admin', 'Employee reinstated', `${emp.rows[0].full_name} has been reinstated`, 'employee', id);
    } catch (err) { console.error('[EmployeesService] Notification error:', err); }

    return { message: 'Employee reinstated successfully' };
  }

  private async getEmployeeIdForUser(userId: string): Promise<string | null> {
    const r = await query('SELECT employee_id FROM users WHERE id = $1', [userId]);
    return r.rows[0]?.employee_id || null;
  }
}
