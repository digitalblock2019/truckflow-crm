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
    // Legacy single-slot filter — kept until PR 2 swaps callers over to the two new fields.
    if (filters.assigned_to) { conditions.push(`t.assigned_agent_id = $${idx++}`); params.push(filters.assigned_to); }
    // New dual-slot filters (post-dispatcher-split). Used by "My Truckers", "Unassigned" tab, etc.
    if (filters.assigned_sales_agent_to) { conditions.push(`t.assigned_sales_agent_id = $${idx++}`); params.push(filters.assigned_sales_agent_to); }
    if (filters.assigned_dispatcher_to)  { conditions.push(`t.assigned_dispatcher_id  = $${idx++}`); params.push(filters.assigned_dispatcher_to); }
    if (filters.unassigned_sales_agent) { conditions.push(`t.assigned_sales_agent_id IS NULL`); }
    if (filters.unassigned_dispatcher)  { conditions.push(`t.assigned_dispatcher_id  IS NULL`); }
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
      `SELECT t.*,
              e.full_name  as agent_name,
              sa.full_name as sales_agent_name,
              dp.full_name as dispatcher_name
         FROM truckers t
         LEFT JOIN employees e  ON e.id  = t.assigned_agent_id
         LEFT JOIN employees sa ON sa.id = t.assigned_sales_agent_id
         LEFT JOIN employees dp ON dp.id = t.assigned_dispatcher_id
        ${where} ORDER BY t.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    return { data: data.rows, total: parseInt(countResult.rows[0].count), page: filters.page || 1, limit };
  }

  async getById(id: string) {
    const result = await query(
      `SELECT t.*,
              e.full_name  as agent_name,
              sa.full_name as sales_agent_name,
              dp.full_name as dispatcher_name,
              op.docs_uploaded, op.docs_required, op.is_fully_onboarded
         FROM truckers t
         LEFT JOIN employees e  ON e.id  = t.assigned_agent_id
         LEFT JOIN employees sa ON sa.id = t.assigned_sales_agent_id
         LEFT JOIN employees dp ON dp.id = t.assigned_dispatcher_id
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
    // Strip any "MC"/"MC-"/whitespace prefix users sometimes type. Store digits only.
    if (data.mc_number) data.mc_number = String(data.mc_number).replace(/\D/g, '');
    if (data.dot_number) data.dot_number = String(data.dot_number).replace(/\D/g, '');
    if (!data.mc_number) throw new AppError('MC number must contain at least one digit', 400, 'VALIDATION_ERROR');

    // Check duplicate MC#
    const dup = await query('SELECT id FROM truckers WHERE mc_number = $1', [data.mc_number]);
    if (dup.rows.length) throw new AppError('Duplicate MC number', 409, 'DUPLICATE');

    const result = await query(
      `INSERT INTO truckers (mc_number, dot_number, legal_name, dba_name, owner_driver_name, phone, email,
       truck_type, truck_types, city, state, physical_address,
       truck_length_ft, truck_width_ft, truck_height_ft, max_payload_lbs, power_units,
       operation_type, preferred_lanes, operating_states, avoid_states, preferred_days,
       notes, status_system, assigned_agent_id, assigned_sales_agent_id, assigned_dispatcher_id, company_commission_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28) RETURNING *`,
      [data.mc_number, data.dot_number, data.legal_name, data.dba_name, data.owner_driver_name,
       data.phone, data.email, data.truck_type,
       Array.isArray(data.truck_types) && data.truck_types.length ? data.truck_types : null,
       data.city, data.state, data.physical_address,
       data.truck_length_ft || null, data.truck_width_ft || null,
       data.truck_height_ft || null, data.max_payload_lbs || null,
       data.power_units ? parseInt(data.power_units) || null : null,
       data.operation_type || null,
       Array.isArray(data.preferred_lanes) && data.preferred_lanes.length ? JSON.stringify(data.preferred_lanes) : null,
       Array.isArray(data.operating_states) && data.operating_states.length ? data.operating_states : null,
       Array.isArray(data.avoid_states) && data.avoid_states.length ? data.avoid_states : null,
       Array.isArray(data.preferred_days) && data.preferred_days.length ? data.preferred_days : null,
       data.notes,
       data.status_system || 'called',
       data.assigned_agent_id || data.assigned_sales_agent_id || data.assigned_dispatcher_id || null,
       data.assigned_sales_agent_id || null,
       data.assigned_dispatcher_id  || null,
       data.company_commission_pct || 0.08]
    );

    // Seed a commission threshold for every assignee. With the split, a trucker
    // can have a sales agent AND a dispatcher (potentially the same employee).
    // The threshold table is keyed on (trucker_id, agent_employee_id), so the
    // same person filling both roles gets ONE row — that's fine, commission
    // math splits per-role at the load level, not here.
    const assigneeIds = Array.from(new Set([
      data.assigned_agent_id,
      data.assigned_sales_agent_id,
      data.assigned_dispatcher_id,
    ].filter(Boolean) as string[]));
    if (assigneeIds.length) {
      const defaultThreshold = await query("SELECT value FROM system_settings WHERE key = 'agent_commission_threshold_default'");
      const thresholdLoads = parseInt(defaultThreshold.rows[0]?.value || '1');
      for (const employeeId of assigneeIds) {
        await query(
          `INSERT INTO agent_commission_thresholds (trucker_id, agent_employee_id, threshold_loads, set_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (trucker_id, agent_employee_id) DO NOTHING`,
          [result.rows[0].id, employeeId, thresholdLoads, userId]
        );
      }
    }

    return result.rows[0];
  }

  // Throws AppError(400) if the trucker still has unfulfilled required documents.
  // "Required" = non-conditional doc types where is_required=TRUE,
  //   plus conditional doc types whose flag (uses_factoring / is_new_authority /
  //   uses_quick_pay) is currently TRUE on the trucker.
  // Called from every code path that can flip status_system to 'fully_onboarded'
  // so the rule can't be bypassed via the generic update endpoint or dropdown.
  private async assertReadyForFullyOnboarded(id: string) {
    const flagRow = await query(
      'SELECT uses_factoring, is_new_authority, uses_quick_pay FROM truckers WHERE id = $1',
      [id]
    );
    if (!flagRow.rows.length) throw new AppError('Trucker not found', 404, 'NOT_FOUND');
    const flags = flagRow.rows[0];

    // Pull every doc type and filter in JS — same logic as getChecklist, so the
    // "required" set the server enforces matches what the user sees in the UI.
    // (Earlier version did this in SQL with `$N::boolean = TRUE`, which 500s on
    // some pg driver versions when the parameter is already a JS boolean.)
    const typesRes = await query(
      'SELECT id, label, is_required, condition_flag FROM trucker_document_types'
    );
    const allTypes = typesRes.rows as {
      id: string;
      label: string;
      is_required: boolean;
      condition_flag: string | null;
    }[];

    const required = allTypes.filter((t) => {
      if (t.condition_flag) return !!(flags as Record<string, unknown>)[t.condition_flag];
      return t.is_required;
    });

    if (required.length === 0) {
      throw new AppError(
        'Cannot mark fully onboarded: no document types are configured',
        400,
        'VALIDATION_ERROR'
      );
    }

    const uploadedRes = await query(
      'SELECT document_type_id FROM trucker_documents WHERE trucker_id = $1 AND is_current = TRUE',
      [id]
    );
    const uploaded = new Set(uploadedRes.rows.map((r: any) => r.document_type_id));

    const missing = required.filter((t) => !uploaded.has(t.id));
    if (missing.length > 0) {
      throw new AppError(
        `Cannot mark fully onboarded — missing required document(s): ${missing.map((m) => m.label).join(', ')}`,
        400,
        'VALIDATION_ERROR'
      );
    }
  }

  async update(id: string, data: any, userId: string) {
    const existing = await query('SELECT * FROM truckers WHERE id = $1', [id]);
    if (!existing.rows.length) throw new AppError('Trucker not found', 404, 'NOT_FOUND');
    const old = existing.rows[0];

    // Block any path that tries to flip status to fully_onboarded without
    // the required document checklist being complete. Enforced server-side so
    // the Truckers-page status dropdown can't bypass the onboarding workflow.
    if (data.status_system === 'fully_onboarded' && old.status_system !== 'fully_onboarded') {
      await this.assertReadyForFullyOnboarded(id);
    }

    // Track status changes and auto-assign the acting user as sales agent
    // if nothing is set yet. (Auto-assign only fills the sales slot; the
    // dispatcher slot is always set explicitly.)
    if (data.status_system && data.status_system !== old.status_system) {
      await query(
        `INSERT INTO trucker_status_history (trucker_id, old_status_system, old_status_custom_id, new_status_system, new_status_custom_id, changed_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, old.status_system, old.status_custom_id, data.status_system, data.status_custom_id || null, userId]
      );

      // Also write a status_change row to audit_log with new_value populated so
      // the dashboard can break activity down (calls / sms / interested / etc.).
      // Best-effort — never block the status change on the audit failing.
      try {
        await query(
          `INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, description, field_changed, old_value, new_value)
           VALUES ($1, (SELECT role FROM users WHERE id=$1), 'status_change', 'trucker', $2, $3, 'status_system', $4, $5)`,
          [userId, id, `Status: ${old.status_system ?? '—'} → ${data.status_system}`, old.status_system, data.status_system],
        );
      } catch (err: any) {
        console.error('[trucker status_change audit] insert failed:', err?.message);
      }

      if (!old.assigned_sales_agent_id && !old.assigned_agent_id && data.assigned_sales_agent_id === undefined) {
        const userEmployee = await query('SELECT id FROM employees WHERE crm_user_id = $1', [userId]);
        if (userEmployee.rows.length) {
          data.assigned_sales_agent_id = userEmployee.rows[0].id;
          // Mirror to the legacy column too so back-compat readers keep working
          // until PR 2 (frontend) lands.
          if (data.assigned_agent_id === undefined) data.assigned_agent_id = userEmployee.rows[0].id;
        }
      }
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(data)) {
      // preferred_lanes is JSONB — stringify so node-postgres doesn't try to
      // bind it as a Postgres array, which would fail for an array of objects.
      if (key === 'preferred_lanes' && value !== null && value !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(JSON.stringify(value));
        continue;
      }
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
    if (!fields.length) throw new AppError('No fields to update', 400, 'VALIDATION_ERROR');
    fields.push('updated_at = NOW()');
    values.push(id);

    await query(`UPDATE truckers SET ${fields.join(', ')} WHERE id = $${idx}`, values);

    // Notify any newly-assigned employees. We fire for each slot independently
    // so if a sales_and_dispatcher user is set as BOTH slots in one update,
    // they still only get a single notification (de-duped via the Set).
    const newlyAssigned = new Set<string>();
    if (data.assigned_sales_agent_id && data.assigned_sales_agent_id !== old.assigned_sales_agent_id) {
      newlyAssigned.add(data.assigned_sales_agent_id);
    }
    if (data.assigned_dispatcher_id && data.assigned_dispatcher_id !== old.assigned_dispatcher_id) {
      newlyAssigned.add(data.assigned_dispatcher_id);
    }
    if (data.assigned_agent_id && data.assigned_agent_id !== old.assigned_agent_id) {
      newlyAssigned.add(data.assigned_agent_id);
    }
    for (const employeeId of newlyAssigned) {
      try {
        const agentUser = await query('SELECT crm_user_id FROM employees WHERE id = $1', [employeeId]);
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
        // Strip "MC"/"MC-" prefixes and any other non-digits from MC/DOT so the
        // stored value is always normalized digits-only. Matches the Add Trucker
        // form's input filter and the converter we use for FMCSA exports.
        const mcNumber = row.mc_number ? String(row.mc_number).replace(/\D/g, '') : '';
        const dotNumber = row.dot_number ? String(row.dot_number).replace(/\D/g, '') : null;
        if (!mcNumber) { errored++; continue; }
        const dup = await query('SELECT id FROM truckers WHERE mc_number = $1', [mcNumber]);
        if (dup.rows.length) { skipped++; continue; }
        await query(
          `INSERT INTO truckers (mc_number, dot_number, legal_name, dba_name, phone, email, state,
           physical_address, power_units, status_system, upload_batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'imported',$10)`,
          [mcNumber, dotNumber, row.legal_name, row.dba_name, row.phone, row.email,
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

  // Per-user trucker-activity counts for "what got done today" dashboard card.
  // Returns a generic "total touches" number plus a breakdown of meaningful
  // outreach moments (calls / sms / interested) derived from status_change
  // audit rows whose new_value matches a trucker_status enum value.
  async getTodayActivity(userId: string, role: string) {
    const isPrivileged = role === 'admin' || role === 'supervisor';

    const mine = await query(
      `SELECT
         count(*)::int AS total,
         count(*) FILTER (WHERE action = 'status_change' AND new_value = 'called')::int AS calls,
         count(*) FILTER (WHERE action = 'status_change' AND new_value = 'sms_sent')::int AS sms,
         count(*) FILTER (WHERE action = 'status_change' AND new_value = 'interested')::int AS interested
       FROM audit_log
       WHERE user_id = $1 AND entity_type = 'trucker'
         AND created_at >= CURRENT_DATE`,
      [userId],
    );
    const m = mine.rows[0] || { total: 0, calls: 0, sms: 0, interested: 0 };
    const my_today = { total: m.total, calls: m.calls, sms: m.sms, interested: m.interested };

    if (!isPrivileged) {
      return { my_today };
    }

    // Every active sales rep / dispatcher / dual-role user — LEFT JOIN their
    // trucker activity so we still surface a card for people with zero activity.
    const team = await query(
      `SELECT u.id AS user_id, u.full_name, u.role,
              COALESCE(td.total, 0)::int      AS today_total,
              COALESCE(td.calls, 0)::int      AS today_calls,
              COALESCE(td.sms, 0)::int        AS today_sms,
              COALESCE(td.interested, 0)::int AS today_interested,
              COALESCE(wk.total, 0)::int      AS last_7_days
         FROM users u
         LEFT JOIN (
           SELECT user_id,
                  count(*)::int AS total,
                  count(*) FILTER (WHERE action = 'status_change' AND new_value = 'called')::int    AS calls,
                  count(*) FILTER (WHERE action = 'status_change' AND new_value = 'sms_sent')::int  AS sms,
                  count(*) FILTER (WHERE action = 'status_change' AND new_value = 'interested')::int AS interested
             FROM audit_log
            WHERE entity_type = 'trucker' AND created_at >= CURRENT_DATE
            GROUP BY user_id
         ) td ON td.user_id = u.id
         LEFT JOIN (
           SELECT user_id, count(*)::int AS total FROM audit_log
            WHERE entity_type = 'trucker' AND created_at >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY user_id
         ) wk ON wk.user_id = u.id
        WHERE u.is_active = TRUE
          AND u.role IN ('sales_agent', 'dispatcher', 'sales_and_dispatcher')
        ORDER BY today_total DESC, last_7_days DESC, u.full_name`,
    );

    return { my_today, team: team.rows };
  }

  // Reassign sales agent and/or dispatcher across a set of truckers in one
  // shot. undefined = leave the field alone; null = clear it; a UUID = assign.
  // Either `ids` (explicit selection) or `batchId` (entire upload batch).
  async bulkAssign(
    opts: { ids?: string[]; batchId?: string | null },
    salesAgentId: string | null | undefined,
    dispatcherId: string | null | undefined,
    userId: string,
  ) {
    const { ids, batchId } = opts;
    if ((!Array.isArray(ids) || ids.length === 0) && !batchId) {
      throw new AppError('ids or batch_id required', 400, 'VALIDATION_ERROR');
    }
    if (salesAgentId === undefined && dispatcherId === undefined) {
      throw new AppError('Provide sales_agent_id and/or dispatcher_id', 400, 'VALIDATION_ERROR');
    }

    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let idx = 1;

    if (salesAgentId !== undefined) {
      sets.push(`assigned_sales_agent_id = $${idx}`);
      // Mirror to the legacy assigned_agent_id column for back-compat readers.
      sets.push(`assigned_agent_id = $${idx}`);
      params.push(salesAgentId);
      idx++;
    }
    if (dispatcherId !== undefined) {
      sets.push(`assigned_dispatcher_id = $${idx++}`);
      params.push(dispatcherId);
    }

    let whereClause: string;
    if (batchId) {
      whereClause = `upload_batch_id = $${idx++}`;
      params.push(batchId);
    } else {
      whereClause = `id = ANY($${idx++}::uuid[])`;
      params.push(ids);
    }
    const result = await query(
      `UPDATE truckers SET ${sets.join(', ')} WHERE ${whereClause} RETURNING id`,
      params,
    );
    const updated = result.rowCount || 0;

    try {
      const desc =
        `Bulk-assigned ${updated} trucker(s)` +
        (salesAgentId !== undefined ? ` · sales=${salesAgentId ?? 'cleared'}` : '') +
        (dispatcherId !== undefined ? ` · dispatcher=${dispatcherId ?? 'cleared'}` : '');
      await query(
        `INSERT INTO audit_log (user_id, user_role, action, entity_type, description)
         VALUES ($1, (SELECT role FROM users WHERE id=$1), 'update', 'trucker', $2)`,
        [userId, desc],
      );
    } catch (err: any) {
      console.error('[bulkAssign] audit failed:', err?.message);
    }

    return { updated };
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

    await this.assertReadyForFullyOnboarded(id);

    // The UPDATE commits independently from the two follow-up INSERTs. If we
    // let history/audit errors bubble up as 500s, we'd be in a bad state:
    // status is flipped in the DB but the caller sees failure and has no idea
    // why. Wrap each side effect with named logging and swallow non-fatal
    // failures (the audit_log row is nice-to-have, not load-bearing).
    try {
      await query(
        `UPDATE truckers SET status_system='fully_onboarded', fully_onboarded_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [id]
      );
    } catch (err: any) {
      console.error('[markFullyOnboarded] UPDATE truckers failed:', err?.message, err?.code);
      throw err;
    }

    try {
      await query(
        `INSERT INTO trucker_status_history (trucker_id, old_status_system, old_status_custom_id, new_status_system, new_status_custom_id, changed_by)
         VALUES ($1,$2,$3,'fully_onboarded',NULL,$4)`,
        [id, old.status_system, old.status_custom_id, userId]
      );
    } catch (err: any) {
      // Status already flipped successfully — don't fail the request just because
      // history logging blew up. Log loudly so we can fix it.
      console.error('[markFullyOnboarded] INSERT trucker_status_history failed:', err?.message, err?.code, err?.detail);
    }

    try {
      await query(
        `INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, description)
         VALUES ($1, (SELECT role FROM users WHERE id=$1), 'fully_onboarded', 'trucker', $2, $3)`,
        [userId, id, `Marked trucker as fully onboarded: ${old.legal_name} (MC# ${old.mc_number})`]
      );
    } catch (err: any) {
      console.error('[markFullyOnboarded] INSERT audit_log failed:', err?.message, err?.code, err?.detail);
    }

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
