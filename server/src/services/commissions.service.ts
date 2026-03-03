import { query } from '../config/database';
import { AppError } from '../utils/AppError';

export class CommissionsService {
  async list(filters: any) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters.status) { conditions.push(`c.status = $${idx++}`); params.push(filters.status); }
    if (filters.employee_id) { conditions.push(`c.employee_id = $${idx++}`); params.push(filters.employee_id); }
    if (filters.employee_type) { conditions.push(`c.employee_type = $${idx++}`); params.push(filters.employee_type); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = filters.limit || 50;
    const offset = ((filters.page || 1) - 1) * limit;

    const data = await query(
      `SELECT c.*, e.full_name as employee_name, lo.order_number, lo.trucker_id
       FROM commissions c
       JOIN employees e ON e.id = c.employee_id
       JOIN load_orders lo ON lo.id = c.load_order_id
       ${where} ORDER BY c.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );
    const count = await query(`SELECT count(*) FROM commissions c ${where}`, params);

    // Summary totals
    const excludeClause = conditions.length
      ? `${where} AND c.excluded = FALSE`
      : 'WHERE c.excluded = FALSE';
    const summary = await query(
      `SELECT COALESCE(SUM(c.amount_cents), 0) as total_usd_cents,
              COALESCE(SUM(c.amount_pkr_paisa), 0) as total_pkr_paisa
       FROM commissions c ${excludeClause}`,
      params
    );

    return {
      data: data.rows,
      total: parseInt(count.rows[0].count),
      page: filters.page || 1,
      limit,
      summary: summary.rows[0] || { total_usd_cents: 0, total_pkr_paisa: 0 },
    };
  }

  async updateStatus(id: string, newStatus: string, userId: string) {
    const comm = await query('SELECT * FROM commissions WHERE id = $1', [id]);
    if (!comm.rows.length) throw new AppError('Commission not found', 404, 'NOT_FOUND');

    const current = comm.rows[0].status;
    const valid: Record<string, string[]> = { pending: ['approved'], approved: ['paid'] };
    if (!valid[current]?.includes(newStatus)) {
      throw new AppError(`Cannot transition from ${current} to ${newStatus}`, 422, 'INVALID_TRANSITION');
    }

    const updates: string[] = [`status = $1`, `updated_at = NOW()`];
    const params: any[] = [newStatus];
    let idx = 2;

    if (newStatus === 'approved') {
      updates.push(`approved_by = $${idx++}`, `approved_at = NOW()`);
      params.push(userId);
    } else if (newStatus === 'paid') {
      updates.push(`paid_by = $${idx++}`, `paid_at = NOW()`);
      params.push(userId);
    }

    params.push(id);
    await query(`UPDATE commissions SET ${updates.join(', ')} WHERE id = $${idx}`, params);

    const updated = await query('SELECT * FROM commissions WHERE id = $1', [id]);
    return updated.rows[0];
  }

  async summary(filters: any) {
    const conditions: string[] = ['c.excluded = FALSE'];
    const params: any[] = [];
    let idx = 1;

    if (filters.month) { conditions.push(`DATE_TRUNC('month', lo.payment_received_date) = $${idx++}`); params.push(filters.month); }

    const where = 'WHERE ' + conditions.join(' AND ');

    const data = await query(
      `SELECT c.employee_id, e.full_name, e.employee_type,
              DATE_TRUNC('month', lo.payment_received_date) as month,
              COUNT(c.id) as load_count,
              SUM(c.amount_cents) as total_usd_cents,
              SUM(c.amount_pkr_paisa) as total_pkr_paisa
       FROM commissions c
       JOIN employees e ON e.id = c.employee_id
       JOIN load_orders lo ON lo.id = c.load_order_id
       ${where}
       GROUP BY c.employee_id, e.full_name, e.employee_type, DATE_TRUNC('month', lo.payment_received_date)
       ORDER BY month DESC, total_usd_cents DESC`,
      params
    );
    return data.rows;
  }

  async getExchangeRate() {
    const setting = await query("SELECT value FROM system_settings WHERE key = 'exchange_rate_manual_fallback'");
    const rate = parseFloat(setting.rows[0]?.value || '280');
    return { currency_pair: 'USD/PKR', rate, source: 'manual_fallback', fetched_at: new Date() };
  }
}
