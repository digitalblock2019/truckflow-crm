import { query } from '../config/database';

export class CommunicationsService {
  async list(filters: any) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters.direction) { conditions.push(`e.direction = $${idx++}`); params.push(filters.direction); }
    if (filters.status) { conditions.push(`e.status = $${idx++}`); params.push(filters.status); }
    if (filters.shipper_id) { conditions.push(`e.shipper_id = $${idx++}`); params.push(filters.shipper_id); }
    if (filters.trucker_id) { conditions.push(`e.trucker_id = $${idx++}`); params.push(filters.trucker_id); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = filters.limit || 50;
    const offset = ((filters.page || 1) - 1) * limit;

    const countResult = await query(`SELECT count(*) FROM emails e ${where}`, params);
    const data = await query(
      `SELECT e.*, u.full_name as sent_by_name
       FROM emails e LEFT JOIN users u ON u.id = e.sent_by_user_id
       ${where} ORDER BY e.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );
    return { data: data.rows, total: parseInt(countResult.rows[0].count), page: filters.page || 1, limit };
  }
}
