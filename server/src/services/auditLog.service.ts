import { query } from '../config/database';

export class AuditLogService {
  async list(filters: any) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters.action) { conditions.push(`al.action = $${idx++}`); params.push(filters.action); }
    if (filters.entity_type) { conditions.push(`al.entity_type = $${idx++}`); params.push(filters.entity_type); }
    if (filters.entity_id) { conditions.push(`al.entity_id = $${idx++}`); params.push(filters.entity_id); }
    if (filters.user_id) { conditions.push(`al.user_id = $${idx++}`); params.push(filters.user_id); }
    if (filters.from) { conditions.push(`al.created_at >= $${idx++}`); params.push(filters.from); }
    if (filters.to) { conditions.push(`al.created_at <= $${idx++}`); params.push(filters.to); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = filters.limit || 50;
    const offset = ((filters.page || 1) - 1) * limit;

    const count = await query(`SELECT count(*) FROM audit_log al ${where}`, params);
    const data = await query(
      `SELECT al.*, u.full_name as user_name, u.email as user_email
       FROM audit_log al LEFT JOIN users u ON u.id = al.user_id
       ${where} ORDER BY al.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    return { data: data.rows, total: parseInt(count.rows[0].count), page: filters.page || 1, limit };
  }
}
