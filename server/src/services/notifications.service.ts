import { query } from '../config/database';
import { AppError } from '../utils/AppError';

export class NotificationsService {

  // ── Creation helpers ──────────────────────────────────────────────

  async create(recipientId: string, title: string, body: string, entityType?: string, entityId?: string) {
    await query(
      `INSERT INTO notifications (recipient_id, title, body, entity_type, entity_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [recipientId, title, body, entityType || null, entityId || null]
    );
  }

  async createForRole(role: string, title: string, body: string, entityType?: string, entityId?: string) {
    const users = await query('SELECT id FROM users WHERE role = $1 AND is_active = TRUE', [role]);
    for (const u of users.rows) {
      await this.create(u.id, title, body, entityType, entityId);
    }
  }

  async createForMultiple(recipientIds: string[], title: string, body: string, entityType?: string, entityId?: string) {
    for (const id of recipientIds) {
      await this.create(id, title, body, entityType, entityId);
    }
  }

  // ── Queries ───────────────────────────────────────────────────────

  async list(userId: string, filters: any) {
    const limit = filters.limit || 50;
    const offset = ((filters.page || 1) - 1) * limit;

    const data = await query(
      `SELECT * FROM notifications WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    const count = await query('SELECT count(*) FROM notifications WHERE recipient_id = $1', [userId]);
    const unread = await query('SELECT count(*) FROM notifications WHERE recipient_id = $1 AND is_read = FALSE', [userId]);

    return {
      data: data.rows,
      total: parseInt(count.rows[0].count),
      unread_count: parseInt(unread.rows[0].count),
      page: filters.page || 1,
      limit,
    };
  }

  async markRead(id: string, userId: string) {
    const result = await query(
      'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = $1 AND recipient_id = $2 RETURNING *',
      [id, userId]
    );
    if (!result.rows.length) throw new AppError('Notification not found', 404, 'NOT_FOUND');
    return result.rows[0];
  }

  async markAllRead(userId: string) {
    await query(
      'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE recipient_id = $1 AND is_read = FALSE',
      [userId]
    );
    return { message: 'All notifications marked as read' };
  }
}
