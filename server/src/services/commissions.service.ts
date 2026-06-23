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

  // Returns a totals object the Commissions page consumes:
  //   - flat fields = LIFETIME totals (powers the top formula bar + Lifetime card row)
  //   - current_month = same shape, scoped to the current calendar month by
  //     payment_received_date (powers the This Month card row)
  // Scoped by employee_id when a non-privileged user calls in.
  async summary(filters: any) {
    const conditions: string[] = ['c.excluded = FALSE'];
    const params: any[] = [];
    let idx = 1;

    if (filters.month) { conditions.push(`DATE_TRUNC('month', lo.payment_received_date) = $${idx++}`); params.push(filters.month); }
    if (filters.employee_id) { conditions.push(`c.employee_id = $${idx++}`); params.push(filters.employee_id); }

    const where = 'WHERE ' + conditions.join(' AND ');

    // Commission status totals + count — lifetime AND current month in one query.
    const totals = await query(
      `SELECT
         -- lifetime
         COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'pending'),  0)::bigint AS total_pending_cents,
         COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'approved'), 0)::bigint AS total_approved_cents,
         COALESCE(SUM(c.amount_cents) FILTER (WHERE c.status = 'paid'),     0)::bigint AS total_paid_cents,
         COALESCE(SUM(c.amount_cents),                                       0)::bigint AS total_commission_cents,
         COUNT(c.id)::int AS count,
         -- current month
         COALESCE(SUM(c.amount_cents) FILTER (
           WHERE c.status = 'pending'
             AND DATE_TRUNC('month', lo.payment_received_date) = DATE_TRUNC('month', CURRENT_DATE)
         ), 0)::bigint AS month_pending_cents,
         COALESCE(SUM(c.amount_cents) FILTER (
           WHERE c.status = 'approved'
             AND DATE_TRUNC('month', lo.payment_received_date) = DATE_TRUNC('month', CURRENT_DATE)
         ), 0)::bigint AS month_approved_cents,
         COALESCE(SUM(c.amount_cents) FILTER (
           WHERE c.status = 'paid'
             AND DATE_TRUNC('month', lo.payment_received_date) = DATE_TRUNC('month', CURRENT_DATE)
         ), 0)::bigint AS month_paid_cents,
         COALESCE(SUM(c.amount_cents) FILTER (
           WHERE DATE_TRUNC('month', lo.payment_received_date) = DATE_TRUNC('month', CURRENT_DATE)
         ), 0)::bigint AS month_commission_cents,
         COUNT(c.id) FILTER (
           WHERE DATE_TRUNC('month', lo.payment_received_date) = DATE_TRUNC('month', CURRENT_DATE)
         )::int AS month_count
       FROM commissions c
       JOIN load_orders lo ON lo.id = c.load_order_id
       ${where}`,
      params
    );

    // Load-side totals (distinct, since one load has both an agent + dispatcher row).
    // Carrier pay = gross * (1 - company_pct); net revenue = gross * company_pct.
    const loadTotals = await query(
      `WITH scoped AS (
         SELECT DISTINCT lo.id, lo.gross_load_amount_cents, lo.company_commission_pct
         FROM load_orders lo
         JOIN commissions c ON c.load_order_id = lo.id
         ${where}
       )
       SELECT
         COALESCE(SUM(gross_load_amount_cents), 0)::bigint AS total_gross_cents,
         COALESCE(SUM(ROUND(gross_load_amount_cents * (1 - company_commission_pct))::bigint), 0)::bigint AS total_carrier_cents,
         COALESCE(SUM(ROUND(gross_load_amount_cents * company_commission_pct)::bigint), 0)::bigint AS total_net_cents
       FROM scoped`,
      params
    );

    const t = totals.rows[0];
    const l = loadTotals.rows[0];
    const netCents = Number(l.total_net_cents) || 0;
    const commCents = Number(t.total_commission_cents) || 0;
    // avg_rate = effective commission rate against company net revenue (1 decimal).
    const avgRate = netCents > 0 ? Math.round((commCents / netCents) * 1000) / 10 : 0;

    return {
      total_pending_cents:    Number(t.total_pending_cents)    || 0,
      total_approved_cents:   Number(t.total_approved_cents)   || 0,
      total_paid_cents:       Number(t.total_paid_cents)       || 0,
      total_commission_cents: commCents,
      total_gross_cents:      Number(l.total_gross_cents)      || 0,
      total_carrier_cents:    Number(l.total_carrier_cents)    || 0,
      total_net_cents:        netCents,
      avg_rate:               avgRate,
      count:                  Number(t.count) || 0,
      current_month: {
        total_pending_cents:    Number(t.month_pending_cents)    || 0,
        total_approved_cents:   Number(t.month_approved_cents)   || 0,
        total_paid_cents:       Number(t.month_paid_cents)       || 0,
        total_commission_cents: Number(t.month_commission_cents) || 0,
        count:                  Number(t.month_count)            || 0,
      },
    };
  }

  async getExchangeRate() {
    const setting = await query("SELECT value FROM system_settings WHERE key = 'exchange_rate_manual_fallback'");
    const rate = parseFloat(setting.rows[0]?.value || '280');
    return { currency_pair: 'USD/PKR', rate, source: 'manual_fallback', fetched_at: new Date() };
  }
}
