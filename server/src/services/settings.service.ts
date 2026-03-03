import { query } from '../config/database';
import { AppError } from '../utils/AppError';

export class SettingsService {
  async getAll() {
    const data = await query('SELECT * FROM system_settings ORDER BY key');
    return data.rows;
  }

  async update(settings: Record<string, string>, userId: string) {
    for (const [key, value] of Object.entries(settings)) {
      await query(
        'UPDATE system_settings SET value = $1, updated_by = $2, updated_at = NOW() WHERE key = $3',
        [value, userId, key]
      );
    }
    // Audit log
    await query(
      `INSERT INTO audit_log (user_id, user_role, action, entity_type, description)
       VALUES ($1, (SELECT role FROM users WHERE id=$1), 'update', 'system_settings', $2)`,
      [userId, `Updated settings: ${Object.keys(settings).join(', ')}`]
    );
    return this.getAll();
  }

  async updateThreshold(truckerId: string, agentId: string, data: any, userId: string) {
    const existing = await query(
      'SELECT * FROM agent_commission_thresholds WHERE trucker_id = $1 AND agent_employee_id = $2',
      [truckerId, agentId]
    );

    if (existing.rows.length) {
      await query(
        `UPDATE agent_commission_thresholds SET threshold_loads = $1, is_global_default = FALSE,
         set_by = $2, updated_at = NOW() WHERE trucker_id = $3 AND agent_employee_id = $4`,
        [data.threshold_loads, userId, truckerId, agentId]
      );
    } else {
      await query(
        `INSERT INTO agent_commission_thresholds (trucker_id, agent_employee_id, threshold_loads, is_global_default, set_by)
         VALUES ($1, $2, $3, FALSE, $4)`,
        [truckerId, agentId, data.threshold_loads, userId]
      );
    }

    await query(
      `INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, description)
       VALUES ($1, (SELECT role FROM users WHERE id=$1), 'threshold_change', 'agent_commission_threshold', $2, $3)`,
      [userId, truckerId, `Threshold set to ${data.threshold_loads} for agent ${agentId}`]
    );

    const result = await query(
      'SELECT * FROM agent_commission_thresholds WHERE trucker_id = $1 AND agent_employee_id = $2',
      [truckerId, agentId]
    );
    return result.rows[0];
  }
}
