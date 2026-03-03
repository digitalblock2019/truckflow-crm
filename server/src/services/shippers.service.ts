import { query } from '../config/database';
import { AppError } from '../utils/AppError';

export class ShippersService {
  async list(filters: any) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters.search) {
      conditions.push(`(s.company_name ILIKE $${idx} OR s.contact_name ILIKE $${idx} OR s.email ILIKE $${idx})`);
      params.push(`%${filters.search}%`); idx++;
    }
    if (filters.is_active !== undefined) { conditions.push(`s.is_active = $${idx++}`); params.push(filters.is_active); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = filters.limit || 50;
    const offset = ((filters.page || 1) - 1) * limit;

    const countResult = await query(`SELECT count(*) FROM shippers s ${where}`, params);
    const data = await query(
      `SELECT s.* FROM shippers s ${where} ORDER BY s.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );
    return { data: data.rows, total: parseInt(countResult.rows[0].count), page: filters.page || 1, limit };
  }

  async create(data: any, userId: string) {
    const dup = await query('SELECT id FROM shippers WHERE email = $1', [data.email]);
    if (dup.rows.length) throw new AppError('Shipper with this email already exists', 409, 'DUPLICATE');

    const result = await query(
      `INSERT INTO shippers (company_name, contact_name, email, phone, source, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [data.company_name, data.contact_name, data.email, data.phone, data.source || 'dat_load_board', data.notes, userId]
    );
    return result.rows[0];
  }

  async update(id: string, data: any) {
    const existing = await query('SELECT id FROM shippers WHERE id = $1', [id]);
    if (!existing.rows.length) throw new AppError('Shipper not found', 404, 'NOT_FOUND');

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

    await query(`UPDATE shippers SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    const result = await query('SELECT * FROM shippers WHERE id = $1', [id]);
    return result.rows[0];
  }

  async delete(id: string) {
    const linked = await query('SELECT id FROM load_orders WHERE shipper_id = $1 LIMIT 1', [id]);
    if (linked.rows.length) throw new AppError('Cannot delete shipper with linked loads', 422, 'HAS_DEPENDENCIES');

    await query('DELETE FROM shippers WHERE id = $1', [id]);
    return { message: 'Shipper deleted' };
  }
}
