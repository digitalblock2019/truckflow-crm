import { query } from '../config/database';
import { AppError } from '../utils/AppError';

export class ChatService {
  async listConversations(userId: string) {
    const data = await query(
      `SELECT cc.*, cm.is_admin,
              (SELECT COUNT(*) FROM chat_messages msg
               WHERE msg.conversation_id = cc.id AND msg.is_deleted = FALSE
               AND msg.created_at > COALESCE(
                 (SELECT last_read_at FROM chat_member_state WHERE conversation_id = cc.id AND user_id = $1),
                 '1970-01-01'
               )) as unread_count,
              (SELECT content FROM chat_messages WHERE conversation_id = cc.id AND is_deleted = FALSE ORDER BY created_at DESC LIMIT 1) as last_message
       FROM chat_conversations cc
       JOIN chat_members cm ON cm.conversation_id = cc.id AND cm.user_id = $1 AND cm.left_at IS NULL
       WHERE cc.is_archived = FALSE
       ORDER BY cc.updated_at DESC`,
      [userId]
    );
    return data.rows;
  }

  async createConversation(data: any, userId: string, userRole: string) {
    if (data.type === 'announcement' && !['admin', 'supervisor'].includes(userRole)) {
      throw new AppError('Only admin/supervisor can create announcements', 403, 'FORBIDDEN');
    }

    // DM dedup
    if (data.type === 'direct' && data.member_ids?.length === 1) {
      const otherId = data.member_ids[0];
      const existing = await query(
        `SELECT cc.id FROM chat_conversations cc
         JOIN chat_members cm1 ON cm1.conversation_id = cc.id AND cm1.user_id = $1 AND cm1.left_at IS NULL
         JOIN chat_members cm2 ON cm2.conversation_id = cc.id AND cm2.user_id = $2 AND cm2.left_at IS NULL
         WHERE cc.type = 'direct' AND cc.is_archived = FALSE`,
        [userId, otherId]
      );
      if (existing.rows.length) return existing.rows[0];
    }

    const conv = await query(
      'INSERT INTO chat_conversations (type, name, created_by) VALUES ($1, $2, $3) RETURNING *',
      [data.type, data.name || null, userId]
    );
    const convId = conv.rows[0].id;

    // Add creator as member
    await query('INSERT INTO chat_members (conversation_id, user_id, is_admin) VALUES ($1, $2, TRUE)', [convId, userId]);
    await query('INSERT INTO chat_member_state (conversation_id, user_id, last_read_at) VALUES ($1, $2, NOW())', [convId, userId]);

    // Add other members
    if (data.member_ids) {
      for (const memberId of data.member_ids) {
        if (memberId !== userId) {
          await query('INSERT INTO chat_members (conversation_id, user_id) VALUES ($1, $2)', [convId, memberId]);
          await query('INSERT INTO chat_member_state (conversation_id, user_id) VALUES ($1, $2)', [convId, memberId]);
        }
      }
    }

    // For announcements, add all active users
    if (data.type === 'announcement') {
      const allUsers = await query('SELECT id FROM users WHERE is_active = TRUE AND id != $1', [userId]);
      for (const u of allUsers.rows) {
        await query('INSERT INTO chat_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [convId, u.id]);
        await query('INSERT INTO chat_member_state (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [convId, u.id]);
      }
    }

    return conv.rows[0];
  }

  async getMessages(conversationId: string, userId: string, cursor?: string, limit = 50) {
    // Verify membership
    const member = await query(
      'SELECT id FROM chat_members WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
      [conversationId, userId]
    );
    if (!member.rows.length) throw new AppError('Not a member of this conversation', 403, 'FORBIDDEN');

    const conditions = ['m.conversation_id = $1', 'm.is_deleted = FALSE'];
    const params: any[] = [conversationId];
    let idx = 2;

    if (cursor) { conditions.push(`m.created_at < $${idx++}`); params.push(cursor); }
    params.push(limit);

    const data = await query(
      `SELECT m.*, u.full_name as sender_name, u.role as sender_role
       FROM chat_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY m.created_at DESC LIMIT $${idx}`,
      params
    );
    return data.rows;
  }

  async sendMessage(conversationId: string, content: string, userId: string, replyToId?: string) {
    // Verify membership
    const member = await query(
      'SELECT id FROM chat_members WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
      [conversationId, userId]
    );
    if (!member.rows.length) throw new AppError('Not a member of this conversation', 403, 'FORBIDDEN');

    // For announcements, only admin members can send
    const conv = await query('SELECT type FROM chat_conversations WHERE id = $1', [conversationId]);
    if (conv.rows[0]?.type === 'announcement') {
      const isAdmin = await query(
        'SELECT is_admin FROM chat_members WHERE conversation_id = $1 AND user_id = $2',
        [conversationId, userId]
      );
      if (!isAdmin.rows[0]?.is_admin) throw new AppError('Only admins can post in announcements', 403, 'FORBIDDEN');
    }

    const result = await query(
      'INSERT INTO chat_messages (conversation_id, sender_id, content, reply_to_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [conversationId, userId, content, replyToId || null]
    );

    // Update conversation updated_at
    await query('UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);

    return result.rows[0];
  }

  async uploadAttachment(conversationId: string, messageData: any, userId: string) {
    // Send a message first, then attach
    const msg = await this.sendMessage(conversationId, messageData.content || null, userId);

    const result = await query(
      `INSERT INTO chat_message_attachments (message_id, file_name, file_path, file_size_bytes, mime_type)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [msg.id, messageData.file_name, messageData.file_path || `chat/${conversationId}/${messageData.file_name}`,
       messageData.file_size_bytes, messageData.mime_type]
    );
    return { message: msg, attachment: result.rows[0] };
  }

  async markRead(conversationId: string, userId: string) {
    await query(
      `INSERT INTO chat_member_state (conversation_id, user_id, last_read_at) VALUES ($1, $2, NOW())
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = NOW()`,
      [conversationId, userId]
    );
    return { message: 'Marked as read' };
  }

  async listAllConversations() {
    const data = await query(
      `SELECT cc.*,
              (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = cc.id AND is_deleted = FALSE) as message_count,
              (SELECT COUNT(*) FROM chat_members WHERE conversation_id = cc.id AND left_at IS NULL) as member_count
       FROM chat_conversations cc ORDER BY cc.updated_at DESC`
    );
    return data.rows;
  }
}
