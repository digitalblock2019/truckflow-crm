import { query } from '../config/database';
import { AppError } from '../utils/AppError';

const STATUS_ORDER = ['pending', 'dispatched', 'in_transit', 'delivered', 'payment_received'];

export class LoadsService {
  async list(filters: any, userId: string, userRole: string) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters.status) { conditions.push(`lo.load_status = $${idx++}`); params.push(filters.status); }
    if (filters.trucker_id) { conditions.push(`lo.trucker_id = $${idx++}`); params.push(filters.trucker_id); }
    if (filters.dispatcher_id) { conditions.push(`lo.dispatcher_id = $${idx++}`); params.push(filters.dispatcher_id); }
    if (filters.agent_id) { conditions.push(`lo.sales_agent_id = $${idx++}`); params.push(filters.agent_id); }

    // Role scoping
    if (userRole === 'sales_agent') {
      const emp = await query('SELECT employee_id FROM users WHERE id = $1', [userId]);
      if (emp.rows[0]?.employee_id) { conditions.push(`lo.sales_agent_id = $${idx++}`); params.push(emp.rows[0].employee_id); }
    } else if (userRole === 'dispatcher') {
      const emp = await query('SELECT employee_id FROM users WHERE id = $1', [userId]);
      if (emp.rows[0]?.employee_id) { conditions.push(`lo.dispatcher_id = $${idx++}`); params.push(emp.rows[0].employee_id); }
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = filters.limit || 50;
    const offset = ((filters.page || 1) - 1) * limit;

    const countResult = await query(`SELECT count(*) FROM load_orders lo ${where}`, params);
    const data = await query(
      `SELECT lo.*, t.legal_name as trucker_name, t.mc_number,
              sa.full_name as agent_name, d.full_name as dispatcher_name
       FROM load_orders lo
       LEFT JOIN truckers t ON t.id = lo.trucker_id
       LEFT JOIN employees sa ON sa.id = lo.sales_agent_id
       LEFT JOIN employees d ON d.id = lo.dispatcher_id
       ${where} ORDER BY lo.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );
    return { data: data.rows, total: parseInt(countResult.rows[0].count), page: filters.page || 1, limit };
  }

  async create(data: any, userId: string) {
    // Get trucker commission pct
    const trucker = await query('SELECT company_commission_pct, assigned_agent_id FROM truckers WHERE id = $1', [data.trucker_id]);
    if (!trucker.rows.length) throw new AppError('Trucker not found', 404, 'NOT_FOUND');

    const companyPct = trucker.rows[0].company_commission_pct;
    const grossCents = data.gross_load_amount_cents;
    const companyGross = Math.round(grossCents * companyPct);

    // Get dispatcher commission
    const dispatcher = await query('SELECT commission_value FROM employees WHERE id = $1', [data.dispatcher_id]);
    if (!dispatcher.rows.length) throw new AppError('Dispatcher not found', 404, 'NOT_FOUND');
    const dispatcherPct = parseFloat(dispatcher.rows[0].commission_value || '0');
    const dispatcherComm = Math.round(companyGross * dispatcherPct);

    // Get agent commission + threshold
    let agentPct = 0, agentComm = 0, agentEligibility = 'not_applicable', agentLoadNum: number | null = null;
    const agentId = data.sales_agent_id || trucker.rows[0].assigned_agent_id;

    if (agentId) {
      const agent = await query('SELECT commission_value FROM employees WHERE id = $1', [agentId]);
      agentPct = parseFloat(agent.rows[0]?.commission_value || '0');

      const threshold = await query(
        'SELECT * FROM agent_commission_thresholds WHERE trucker_id = $1 AND agent_employee_id = $2',
        [data.trucker_id, agentId]
      );

      if (threshold.rows.length) {
        const t = threshold.rows[0];
        if (t.eligibility_status === 'eligible' && t.loads_used < t.threshold_loads) {
          agentEligibility = 'eligible';
          agentLoadNum = t.loads_used + 1;
          agentComm = Math.round(companyGross * agentPct);
          // Increment loads_used
          await query('UPDATE agent_commission_thresholds SET loads_used = loads_used + 1, updated_at = NOW() WHERE id = $1', [t.id]);
          // Check if threshold reached
          if (agentLoadNum !== null && agentLoadNum >= t.threshold_loads) {
            await query("UPDATE agent_commission_thresholds SET eligibility_status = 'threshold_reached', updated_at = NOW() WHERE id = $1", [t.id]);
          }
        } else {
          agentEligibility = t.eligibility_status;
        }
      }
    }

    const companyNet = companyGross - agentComm - dispatcherComm;

    const result = await query(
      `INSERT INTO load_orders (trucker_id, load_origin, load_destination, gross_load_amount_cents,
       company_commission_pct, sales_agent_id, agent_commission_pct, agent_commission_cents,
       agent_eligibility, agent_threshold_load_num, dispatcher_id, dispatcher_commission_pct,
       dispatcher_commission_cents, company_net_cents, shipper_id, shipper_email_override, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [data.trucker_id, data.load_origin, data.load_destination, grossCents, companyPct,
       agentId, agentPct, agentComm, agentEligibility, agentLoadNum,
       data.dispatcher_id, dispatcherPct, dispatcherComm, companyNet,
       data.shipper_id, data.shipper_email_override, data.notes, userId]
    );

    const loadId = result.rows[0].id;

    // Create commission records
    if (dispatcherComm > 0) {
      await query(
        `INSERT INTO commissions (load_order_id, employee_id, employee_type, amount_cents)
         VALUES ($1, $2, 'dispatcher', $3)`,
        [loadId, data.dispatcher_id, dispatcherComm]
      );
    }
    if (agentComm > 0 && agentId) {
      await query(
        `INSERT INTO commissions (load_order_id, employee_id, employee_type, amount_cents)
         VALUES ($1, $2, 'sales_agent', $3)`,
        [loadId, agentId, agentComm]
      );
    }

    return result.rows[0];
  }

  async updateStatus(id: string, newStatus: string, userId: string) {
    const load = await query('SELECT * FROM load_orders WHERE id = $1', [id]);
    if (!load.rows.length) throw new AppError('Load not found', 404, 'NOT_FOUND');

    const current = load.rows[0].load_status;
    const currentIdx = STATUS_ORDER.indexOf(current);
    const newIdx = STATUS_ORDER.indexOf(newStatus);

    if (newIdx < 0) throw new AppError('Invalid status', 400, 'VALIDATION_ERROR');
    if (newIdx !== currentIdx + 1 && newIdx !== currentIdx - 1)
      throw new AppError(`Cannot transition from ${current} to ${newStatus}`, 422, 'INVALID_TRANSITION');

    const updates: string[] = ['load_status = $1', 'updated_at = NOW()'];
    const params: any[] = [newStatus];
    let idx = 2;

    if (newStatus === 'payment_received') {
      updates.push(`payment_received_date = $${idx++}`, `payment_received_by = $${idx++}`);
      params.push(new Date(), userId);

      // Fetch exchange rate and update commissions
      const rateSetting = await query("SELECT value FROM system_settings WHERE key = 'exchange_rate_manual_fallback'");
      const rate = parseFloat(rateSetting.rows[0]?.value || '280');
      await query(
        `UPDATE commissions SET usd_pkr_rate_at_payment = $1,
         amount_pkr_paisa = ROUND(amount_cents * $1 * 100), updated_at = NOW()
         WHERE load_order_id = $2`,
        [rate, id]
      );
    }

    params.push(id);
    await query(`UPDATE load_orders SET ${updates.join(', ')} WHERE id = $${idx}`, params);

    await query(
      `INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, description)
       VALUES ($1, (SELECT role FROM users WHERE id=$1), 'status_change', 'load_order', $2, $3)`,
      [userId, id, `Status: ${current} → ${newStatus}`]
    );

    const updated = await query('SELECT * FROM load_orders WHERE id = $1', [id]);
    return updated.rows[0];
  }

  async excludeFromCommission(id: string, reason: string, userId: string) {
    const load = await query('SELECT id FROM load_orders WHERE id = $1', [id]);
    if (!load.rows.length) throw new AppError('Load not found', 404, 'NOT_FOUND');

    await query(
      `UPDATE load_orders SET exclude_from_commission=TRUE, exclusion_reason=$1, excluded_by=$2, excluded_at=NOW(), updated_at=NOW() WHERE id=$3`,
      [reason, userId, id]
    );
    await query(
      `UPDATE commissions SET excluded=TRUE, exclusion_reason=$1, status='excluded', updated_at=NOW() WHERE load_order_id=$2`,
      [reason, id]
    );
    return { message: 'Load excluded from commission' };
  }
}
