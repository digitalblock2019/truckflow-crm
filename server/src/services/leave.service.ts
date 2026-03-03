import { query } from '../config/database';
import { AppError } from '../utils/AppError';

export class LeaveService {
  async list(filters: { status?: string; employee_id?: string; page?: number; limit?: number }, userId: string, role: string) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters.status) { conditions.push(`lr.status = $${idx++}`); params.push(filters.status); }
    if (filters.employee_id) { conditions.push(`lr.employee_id = $${idx++}`); params.push(filters.employee_id); }

    // Agents can only see their own leave
    if (role === 'sales_agent' || role === 'dispatcher') {
      conditions.push(`lr.employee_id = (SELECT employee_id FROM users WHERE id = $${idx++})`);
      params.push(userId);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = filters.limit || 50;
    const offset = ((filters.page || 1) - 1) * limit;

    const data = await query(
      `SELECT lr.*, e.full_name as employee_name
       FROM employee_leave_requests lr
       JOIN employees e ON e.id = lr.employee_id
       ${where} ORDER BY lr.submitted_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );
    const count = await query(`SELECT count(*) FROM employee_leave_requests lr ${where}`, params);
    return { data: data.rows, total: parseInt(count.rows[0].count), page: filters.page || 1, limit };
  }

  async submit(data: any, userId: string) {
    const empResult = await query('SELECT employee_id FROM users WHERE id = $1', [userId]);
    const empId = empResult.rows[0]?.employee_id;
    if (!empId) throw new AppError('No linked employee record', 400, 'VALIDATION_ERROR');

    const result = await query(
      `INSERT INTO employee_leave_requests (employee_id, leave_type, start_date, end_date, reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [empId, data.leave_type, data.start_date, data.end_date, data.reason]
    );
    return result.rows[0];
  }

  async decide(id: string, decision: string, notes: string, userId: string) {
    if (!['approved', 'rejected'].includes(decision)) throw new AppError('Invalid decision', 400, 'VALIDATION_ERROR');

    const existing = await query('SELECT * FROM employee_leave_requests WHERE id = $1', [id]);
    if (!existing.rows.length) throw new AppError('Leave request not found', 404, 'NOT_FOUND');
    if (existing.rows[0].status !== 'pending') throw new AppError('Already decided', 422, 'ALREADY_DECIDED');

    const result = await query(
      `UPDATE employee_leave_requests SET status=$1, reviewed_by=$2, reviewed_at=NOW(), decision_notes=$3 WHERE id=$4 RETURNING *`,
      [decision, userId, notes, id]
    );

    // If approved, update employee status
    if (decision === 'approved') {
      await query(`UPDATE employees SET employment_status='on_leave', updated_at=NOW() WHERE id=$1`, [existing.rows[0].employee_id]);
    }

    return result.rows[0];
  }
}
