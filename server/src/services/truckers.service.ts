import { query } from '../config/database';
import { AppError } from '../utils/AppError';

export class TruckersService {
  async list(filters: any) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters.status) { conditions.push(`t.status_system = $${idx++}`); params.push(filters.status); }
    if (filters.assigned_to) { conditions.push(`t.assigned_agent_id = $${idx++}`); params.push(filters.assigned_to); }
    if (filters.state) { conditions.push(`t.state ILIKE $${idx++}`); params.push(`%${filters.state}%`); }
    if (filters.fmcsa_status) { conditions.push(`t.fmcsa_operating_status = $${idx++}`); params.push(filters.fmcsa_status); }
    if (filters.search) {
      conditions.push(`(t.legal_name ILIKE $${idx} OR t.mc_number ILIKE $${idx} OR t.dba_name ILIKE $${idx} OR t.phone ILIKE $${idx})`);
      params.push(`%${filters.search}%`); idx++;
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = filters.limit || 50;
    const offset = ((filters.page || 1) - 1) * limit;

    const countResult = await query(`SELECT count(*) FROM truckers t ${where}`, params);
    const data = await query(
      `SELECT t.*, e.full_name as agent_name
       FROM truckers t LEFT JOIN employees e ON e.id = t.assigned_agent_id
       ${where} ORDER BY t.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    return { data: data.rows, total: parseInt(countResult.rows[0].count), page: filters.page || 1, limit };
  }

  async getById(id: string) {
    const result = await query(
      `SELECT t.*, e.full_name as agent_name,
              op.docs_uploaded, op.docs_required, op.is_fully_onboarded
       FROM truckers t
       LEFT JOIN employees e ON e.id = t.assigned_agent_id
       LEFT JOIN v_onboarding_progress op ON op.id = t.id
       WHERE t.id = $1`, [id]
    );
    if (!result.rows.length) throw new AppError('Trucker not found', 404, 'NOT_FOUND');

    // Get commission threshold if agent assigned
    const trucker = result.rows[0];
    if (trucker.assigned_agent_id) {
      const threshold = await query(
        'SELECT * FROM agent_commission_thresholds WHERE trucker_id = $1 AND agent_employee_id = $2',
        [id, trucker.assigned_agent_id]
      );
      trucker.commission_threshold = threshold.rows[0] || null;
    }
    return trucker;
  }

  async create(data: any, userId: string) {
    // Check duplicate MC#
    const dup = await query('SELECT id FROM truckers WHERE mc_number = $1', [data.mc_number]);
    if (dup.rows.length) throw new AppError('Duplicate MC number', 409, 'DUPLICATE');

    const result = await query(
      `INSERT INTO truckers (mc_number, dot_number, legal_name, dba_name, owner_driver_name, phone, email,
       truck_type, state, physical_address, notes, status_system, assigned_agent_id, company_commission_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [data.mc_number, data.dot_number, data.legal_name, data.dba_name, data.owner_driver_name,
       data.phone, data.email, data.truck_type, data.state, data.physical_address, data.notes,
       data.status_system || 'called', data.assigned_agent_id, data.company_commission_pct || 0.08]
    );

    // Create threshold if agent assigned
    if (data.assigned_agent_id) {
      const defaultThreshold = await query("SELECT value FROM system_settings WHERE key = 'agent_commission_threshold_default'");
      const thresholdLoads = parseInt(defaultThreshold.rows[0]?.value || '1');
      await query(
        `INSERT INTO agent_commission_thresholds (trucker_id, agent_employee_id, threshold_loads, set_by)
         VALUES ($1, $2, $3, $4)`,
        [result.rows[0].id, data.assigned_agent_id, thresholdLoads, userId]
      );
    }

    return result.rows[0];
  }

  async update(id: string, data: any, userId: string) {
    const existing = await query('SELECT * FROM truckers WHERE id = $1', [id]);
    if (!existing.rows.length) throw new AppError('Trucker not found', 404, 'NOT_FOUND');
    const old = existing.rows[0];

    // Track status changes
    if (data.status_system && data.status_system !== old.status_system) {
      await query(
        `INSERT INTO trucker_status_history (trucker_id, old_status_system, old_status_custom_id, new_status_system, new_status_custom_id, changed_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, old.status_system, old.status_custom_id, data.status_system, data.status_custom_id || null, userId]
      );
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
    if (!fields.length) throw new AppError('No fields to update', 400, 'VALIDATION_ERROR');
    fields.push('updated_at = NOW()');
    values.push(id);

    await query(`UPDATE truckers SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    return this.getById(id);
  }

  async bulkImport(rows: any[], userId: string) {
    const batch = await query(
      'INSERT INTO trucker_upload_batches (filename, uploaded_by) VALUES ($1, $2) RETURNING id',
      ['csv-import', userId]
    );
    const batchId = batch.rows[0].id;

    let added = 0, skipped = 0, errored = 0;
    for (const row of rows) {
      try {
        const dup = await query('SELECT id FROM truckers WHERE mc_number = $1', [row.mc_number]);
        if (dup.rows.length) { skipped++; continue; }
        await query(
          `INSERT INTO truckers (mc_number, dot_number, legal_name, dba_name, phone, email, state,
           physical_address, status_system, upload_batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'called',$9)`,
          [row.mc_number, row.dot_number, row.legal_name, row.dba_name, row.phone, row.email,
           row.state, row.physical_address, batchId]
        );
        added++;
      } catch { errored++; }
    }

    await query('UPDATE trucker_upload_batches SET rows_added=$1, rows_skipped=$2, rows_errored=$3 WHERE id=$4',
      [added, skipped, errored, batchId]);

    return { batch_id: batchId, rows_added: added, rows_skipped: skipped, rows_errored: errored };
  }

  async initiateOnboarding(id: string, userId: string) {
    const trucker = await query('SELECT * FROM truckers WHERE id = $1', [id]);
    if (!trucker.rows.length) throw new AppError('Trucker not found', 404, 'NOT_FOUND');

    await query(
      `UPDATE truckers SET status_system='onboarded', status_custom_id=NULL,
       onboarding_initiated_at=NOW(), onboarding_initiated_by=$1, updated_at=NOW() WHERE id=$2`,
      [userId, id]
    );

    await query(
      `INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, description)
       VALUES ($1, (SELECT role FROM users WHERE id=$1), 'onboarding_initiated', 'trucker', $2, 'Onboarding initiated')`,
      [userId, id]
    );

    return { message: 'Onboarding initiated' };
  }
}
