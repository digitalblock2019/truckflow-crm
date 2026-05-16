import { query } from '../config/database';
import { AppError } from '../utils/AppError';
import { NotificationsService } from './notifications.service';

const notifications = new NotificationsService();

export class TruckersService {
  async list(filters: any) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters.status) {
      const statuses = (filters.status as string).split(',').map((s: string) => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        conditions.push(`t.status_system = $${idx++}`); params.push(statuses[0]);
      } else {
        const placeholders = statuses.map(() => `$${idx++}`).join(', ');
        conditions.push(`t.status_system IN (${placeholders})`); params.push(...statuses);
      }
    }
    if (filters.assigned_to) { conditions.push(`t.assigned_agent_id = $${idx++}`); params.push(filters.assigned_to); }
    if (filters.state) { conditions.push(`t.state ILIKE $${idx++}`); params.push(`%${filters.state}%`); }
    if (filters.fmcsa_status) { conditions.push(`t.fmcsa_operating_status = $${idx++}`); params.push(filters.fmcsa_status); }
    if (filters.batch) { conditions.push(`t.upload_batch_id = $${idx++}`); params.push(filters.batch); }
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
       truck_type, truck_types, city, state, physical_address,
       truck_length_ft, truck_width_ft, truck_height_ft, max_payload_lbs, power_units,
       notes, status_system, assigned_agent_id, company_commission_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
      [data.mc_number, data.dot_number, data.legal_name, data.dba_name, data.owner_driver_name,
       data.phone, data.email, data.truck_type,
       Array.isArray(data.truck_types) && data.truck_types.length ? data.truck_types : null,
       data.city, data.state, data.physical_address,
       data.truck_length_ft || null, data.truck_width_ft || null,
       data.truck_height_ft || null, data.max_payload_lbs || null,
       data.power_units ? parseInt(data.power_units) || null : null,
       data.notes,
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

    // Track status changes and auto-assign agent
    if (data.status_system && data.status_system !== old.status_system) {
      await query(
        `INSERT INTO trucker_status_history (trucker_id, old_status_system, old_status_custom_id, new_status_system, new_status_custom_id, changed_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, old.status_system, old.status_custom_id, data.status_system, data.status_custom_id || null, userId]
      );

      // Auto-assign agent if not already assigned
      if (!old.assigned_agent_id) {
        const userEmployee = await query('SELECT id FROM employees WHERE crm_user_id = $1', [userId]);
        if (userEmployee.rows.length) {
          data.assigned_agent_id = userEmployee.rows[0].id;
        }
      }
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

    // Notify agent if newly assigned
    if (data.assigned_agent_id && data.assigned_agent_id !== old.assigned_agent_id) {
      try {
        const agentUser = await query('SELECT crm_user_id FROM employees WHERE id = $1', [data.assigned_agent_id]);
        if (agentUser.rows[0]?.crm_user_id) {
          await notifications.create(agentUser.rows[0].crm_user_id, 'Trucker assigned to you', `${old.legal_name} (MC# ${old.mc_number}) has been assigned to you`, 'trucker', id);
        }
      } catch (err) { console.error('[TruckersService] Notification error:', err); }
    }

    return this.getById(id);
  }

  async bulkImport(rows: any[], userId: string, filename?: string, existingBatchId?: string, isLastChunk: boolean = true) {
    // If a batch_id is passed (subsequent chunk), append to that batch instead of
    // creating a new one. Large client-side uploads chunk into ~500-row pieces and
    // thread the batch_id through so they roll up into a single upload-history row.
    let batchId: string;
    if (existingBatchId) {
      const r = await query('SELECT id FROM trucker_upload_batches WHERE id = $1', [existingBatchId]);
      if (!r.rows.length) throw new AppError('Batch not found', 404, 'NOT_FOUND');
      batchId = existingBatchId;
    } else {
      const batch = await query(
        'INSERT INTO trucker_upload_batches (filename, uploaded_by) VALUES ($1, $2) RETURNING id',
        [filename || 'import', userId]
      );
      batchId = batch.rows[0].id;
    }

    let added = 0, skipped = 0, errored = 0;
    for (const row of rows) {
      try {
        const dup = await query('SELECT id FROM truckers WHERE mc_number = $1', [row.mc_number]);
        if (dup.rows.length) { skipped++; continue; }
        await query(
          `INSERT INTO truckers (mc_number, dot_number, legal_name, dba_name, phone, email, state,
           physical_address, power_units, status_system, upload_batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'imported',$10)`,
          [row.mc_number, row.dot_number, row.legal_name, row.dba_name, row.phone, row.email,
           row.state, row.physical_address,
           row.power_units ? parseInt(row.power_units) || null : null,
           batchId]
        );
        added++;
      } catch { errored++; }
    }

    // Increment cumulative totals on the batch row
    const totals = await query(
      `UPDATE trucker_upload_batches
       SET rows_added = COALESCE(rows_added, 0) + $1,
           rows_skipped = COALESCE(rows_skipped, 0) + $2,
           rows_errored = COALESCE(rows_errored, 0) + $3
       WHERE id = $4
       RETURNING rows_added, rows_skipped, rows_errored`,
      [added, skipped, errored, batchId]
    );
    const cumulative = totals.rows[0];

    // Only notify on the final chunk so admins get one notification per upload, not N
    if (isLastChunk) {
      try {
        const title = 'New batch uploaded';
        const body = `${filename || 'import'} — ${cumulative.rows_added} truckers added`;
        await notifications.createForRole('admin', title, body, 'trucker_batch', batchId);
        await notifications.createForRole('supervisor', title, body, 'trucker_batch', batchId);
      } catch (err) { console.error('[TruckersService] Notification error:', err); }
    }

    return {
      batch_id: batchId,
      rows_added: cumulative.rows_added,
      rows_skipped: cumulative.rows_skipped,
      rows_errored: cumulative.rows_errored,
    };
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

  async delete(id: string, userId: string) {
    const existing = await query('SELECT * FROM truckers WHERE id = $1', [id]);
    if (!existing.rows.length) throw new AppError('Trucker not found', 404, 'NOT_FOUND');

    // Delete related records first
    await query('DELETE FROM trucker_status_history WHERE trucker_id = $1', [id]);
    await query('DELETE FROM agent_commission_thresholds WHERE trucker_id = $1', [id]);
    await query('DELETE FROM truckers WHERE id = $1', [id]);

    await query(
      `INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, description)
       VALUES ($1, (SELECT role FROM users WHERE id=$1), 'delete', 'trucker', $2, $3)`,
      [userId, id, `Deleted trucker: ${existing.rows[0].legal_name} (MC# ${existing.rows[0].mc_number})`]
    );

    return { message: 'Trucker deleted' };
  }

  async bulkDelete(ids: string[], userId: string) {
    let deleted = 0;
    for (const id of ids) {
      try {
        await query('DELETE FROM trucker_status_history WHERE trucker_id = $1', [id]);
        await query('DELETE FROM agent_commission_thresholds WHERE trucker_id = $1', [id]);
        await query('DELETE FROM truckers WHERE id = $1', [id]);
        deleted++;
      } catch { /* skip errors */ }
    }

    await query(
      `INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, description)
       VALUES ($1, (SELECT role FROM users WHERE id=$1), 'delete', 'trucker', $2, $3)`,
      [userId, 'bulk', `Bulk deleted ${deleted} truckers`]
    );

    return { deleted };
  }

  async deleteBatch(batchId: string, userId: string) {
    // Get all trucker IDs in this batch
    const truckers = await query('SELECT id FROM truckers WHERE upload_batch_id = $1', [batchId]);
    const ids = truckers.rows.map((r: any) => r.id);

    let deleted = 0;
    for (const id of ids) {
      try {
        await query('DELETE FROM trucker_status_history WHERE trucker_id = $1', [id]);
        await query('DELETE FROM agent_commission_thresholds WHERE trucker_id = $1', [id]);
        await query('DELETE FROM truckers WHERE id = $1', [id]);
        deleted++;
      } catch { /* skip errors */ }
    }

    // Delete the batch record itself
    await query('DELETE FROM trucker_upload_batches WHERE id = $1', [batchId]);

    await query(
      `INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, description)
       VALUES ($1, (SELECT role FROM users WHERE id=$1), 'delete', 'trucker_batch', $2, $3)`,
      [userId, batchId, `Deleted import batch and ${deleted} truckers`]
    );

    return { deleted, batch_id: batchId };
  }

  async markFullyOnboarded(id: string, userId: string) {
    const trucker = await query('SELECT * FROM truckers WHERE id = $1', [id]);
    if (!trucker.rows.length) throw new AppError('Trucker not found', 404, 'NOT_FOUND');

    const old = trucker.rows[0];
    if (old.status_system === 'fully_onboarded') throw new AppError('Trucker is already fully onboarded', 400, 'VALIDATION_ERROR');

    await query(
      `UPDATE truckers SET status_system='fully_onboarded', fully_onboarded_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [id]
    );

    await query(
      `INSERT INTO trucker_status_history (trucker_id, old_status_system, old_status_custom_id, new_status_system, new_status_custom_id, changed_by)
       VALUES ($1,$2,$3,'fully_onboarded',NULL,$4)`,
      [id, old.status_system, old.status_custom_id, userId]
    );

    await query(
      `INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, description)
       VALUES ($1, (SELECT role FROM users WHERE id=$1), 'fully_onboarded', 'trucker', $2, $3)`,
      [userId, id, `Marked trucker as fully onboarded: ${old.legal_name} (MC# ${old.mc_number})`]
    );

    return { message: 'Trucker marked as fully onboarded' };
  }

  async listBatches() {
    const result = await query(
      `SELECT b.*, e.full_name as uploaded_by_name
       FROM trucker_upload_batches b
       LEFT JOIN employees e ON e.crm_user_id = b.uploaded_by
       ORDER BY b.uploaded_at DESC`
    );
    return result.rows;
  }
}
