import { query } from '../config/database';
import { AppError } from '../utils/AppError';
import { emitToConversation, emitToUser, getOnlineUsers, joinConversationRoom } from '../config/socket';

export class ChatService {
  // ── List conversations ──────────────────────────────────────────────
  async listConversations(userId: string) {
    const data = await query(
      `SELECT cc.id, cc.type, cc.name, cc.description, cc.created_by, cc.is_archived,
              cc.last_message_at, cc.last_message_preview, cc.created_at, cc.updated_at,
              cm.is_admin,
              COALESCE(cms.is_pinned, FALSE) as is_pinned,
              (SELECT COUNT(*)::int FROM chat_messages msg
               WHERE msg.conversation_id = cc.id AND msg.is_deleted = FALSE
               AND msg.created_at > COALESCE(cms.last_read_at, '1970-01-01')
              ) as unread_count,
              (SELECT COUNT(*)::int FROM chat_members WHERE conversation_id = cc.id AND left_at IS NULL) as participant_count
       FROM chat_conversations cc
       JOIN chat_members cm ON cm.conversation_id = cc.id AND cm.user_id = $1 AND cm.left_at IS NULL
       LEFT JOIN chat_member_state cms ON cms.conversation_id = cc.id AND cms.user_id = $1
       WHERE cc.is_archived = FALSE
       ORDER BY COALESCE(cc.last_message_at, cc.created_at) DESC`,
      [userId]
    );

    // Fetch participants for each conversation
    const convIds = data.rows.map((c: any) => c.id);
    if (convIds.length > 0) {
      const parts = await query(
        `SELECT cm.conversation_id, u.id, u.full_name, u.profile_image_path as profile_image_url, u.last_seen_at
         FROM chat_members cm
         JOIN users u ON u.id = cm.user_id
         WHERE cm.conversation_id = ANY($1) AND cm.left_at IS NULL`,
        [convIds]
      );
      const partMap: Record<string, any[]> = {};
      for (const p of parts.rows) {
        if (!partMap[p.conversation_id]) partMap[p.conversation_id] = [];
        partMap[p.conversation_id].push({ id: p.id, full_name: p.full_name, profile_image_url: p.profile_image_url, last_seen_at: p.last_seen_at });
      }
      for (const c of data.rows) {
        (c as any).participants = partMap[c.id] || [];
        // For DMs, set display name to the other person
        if (c.type === 'direct') {
          const other = (c as any).participants.find((p: any) => p.id !== userId);
          if (other) (c as any).dm_partner = other;
        }
      }
    }

    return data.rows;
  }

  // ── Create conversation ─────────────────────────────────────────────
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
      'INSERT INTO chat_conversations (type, name, description, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [data.type, data.name || null, data.description || null, userId]
    );
    const convId = conv.rows[0].id;

    // Add creator as admin member
    await query('INSERT INTO chat_members (conversation_id, user_id, is_admin) VALUES ($1, $2, TRUE)', [convId, userId]);
    await query('INSERT INTO chat_member_state (conversation_id, user_id, last_read_at) VALUES ($1, $2, NOW())', [convId, userId]);

    // Add other members
    if (data.member_ids) {
      for (const memberId of data.member_ids) {
        if (memberId !== userId) {
          await query('INSERT INTO chat_members (conversation_id, user_id) VALUES ($1, $2)', [convId, memberId]);
          await query('INSERT INTO chat_member_state (conversation_id, user_id) VALUES ($1, $2)', [convId, memberId]);
          joinConversationRoom(convId, memberId);
          emitToUser(memberId, 'conversation:new', conv.rows[0]);
        }
      }
    }

    // For announcements, add all active users
    if (data.type === 'announcement') {
      const allUsers = await query('SELECT id FROM users WHERE is_active = TRUE AND id != $1', [userId]);
      for (const u of allUsers.rows) {
        await query('INSERT INTO chat_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [convId, u.id]);
        await query('INSERT INTO chat_member_state (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [convId, u.id]);
        joinConversationRoom(convId, u.id);
        emitToUser(u.id, 'conversation:new', conv.rows[0]);
      }
    }

    return conv.rows[0];
  }

  // ── Get messages (with attachments, reactions, reply snippets) ──────
  async getMessages(conversationId: string, userId: string, cursor?: string, limit = 50) {
    // Verify membership
    const member = await query(
      'SELECT id FROM chat_members WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
      [conversationId, userId]
    );
    if (!member.rows.length) throw new AppError('Not a member of this conversation', 403, 'FORBIDDEN');

    const conditions = ['m.conversation_id = $1'];
    const params: any[] = [conversationId];
    let idx = 2;

    if (cursor) { conditions.push(`m.created_at < $${idx++}`); params.push(cursor); }
    params.push(limit);

    const data = await query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.reply_to_id,
              m.is_deleted, m.edited_at, m.created_at,
              u.full_name as sender_name, u.role as sender_role, u.profile_image_path as sender_avatar
       FROM chat_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY m.created_at DESC LIMIT $${idx}`,
      params
    );

    const messages = data.rows;
    const msgIds = messages.map((m: any) => m.id);

    if (msgIds.length > 0) {
      // Fetch attachments
      const attachments = await query(
        `SELECT id, message_id, file_name, file_path, file_size_bytes, mime_type, created_at
         FROM chat_message_attachments WHERE message_id = ANY($1)`,
        [msgIds]
      );
      const attachMap: Record<string, any[]> = {};
      for (const a of attachments.rows) {
        if (!attachMap[a.message_id]) attachMap[a.message_id] = [];
        attachMap[a.message_id].push(a);
      }

      // Fetch reactions
      const reactions = await query(
        `SELECT r.message_id, r.emoji, r.user_id, u.full_name
         FROM chat_message_reactions r
         JOIN users u ON u.id = r.user_id
         WHERE r.message_id = ANY($1)`,
        [msgIds]
      );
      const reactionMap: Record<string, any[]> = {};
      for (const r of reactions.rows) {
        if (!reactionMap[r.message_id]) reactionMap[r.message_id] = [];
        reactionMap[r.message_id].push({ emoji: r.emoji, user_id: r.user_id, user_name: r.full_name });
      }

      // Fetch reply-to snippets
      const replyIds = messages.filter((m: any) => m.reply_to_id).map((m: any) => m.reply_to_id);
      const replyMap: Record<string, any> = {};
      if (replyIds.length > 0) {
        const replies = await query(
          `SELECT m.id, m.content, m.sender_id, u.full_name as sender_name
           FROM chat_messages m JOIN users u ON u.id = m.sender_id
           WHERE m.id = ANY($1)`,
          [replyIds]
        );
        for (const r of replies.rows) {
          replyMap[r.id] = { id: r.id, content: r.content?.substring(0, 100), sender_name: r.sender_name };
        }
      }

      for (const msg of messages) {
        (msg as any).attachments = attachMap[msg.id] || [];
        (msg as any).reactions = reactionMap[msg.id] || [];
        (msg as any).reply_to = msg.reply_to_id ? (replyMap[msg.reply_to_id] || null) : null;
        // Show placeholder for deleted messages
        if (msg.is_deleted) {
          msg.content = null;
          (msg as any).attachments = [];
          (msg as any).reactions = [];
        }
      }
    }

    const nextCursor = messages.length === limit ? messages[messages.length - 1].created_at : null;
    return { messages, nextCursor };
  }

  // ── Send message ────────────────────────────────────────────────────
  async sendMessage(conversationId: string, content: string | null, userId: string, replyToId?: string) {
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
      `INSERT INTO chat_messages (conversation_id, sender_id, content, reply_to_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [conversationId, userId, content, replyToId || null]
    );

    const msg = result.rows[0];

    // Update conversation metadata
    const preview = content ? content.substring(0, 100) : '[Attachment]';
    await query(
      'UPDATE chat_conversations SET updated_at = NOW(), last_message_at = NOW(), last_message_preview = $2 WHERE id = $1',
      [conversationId, preview]
    );

    // Get sender info for the socket event
    const sender = await query('SELECT full_name, profile_image_path as profile_image_url FROM users WHERE id = $1', [userId]);
    const enriched = {
      ...msg,
      sender_name: sender.rows[0]?.full_name,
      sender_avatar: sender.rows[0]?.profile_image_url,
      attachments: [],
      reactions: [],
      reply_to: null,
    };

    // If reply, fetch snippet
    if (replyToId) {
      const replySnippet = await query(
        `SELECT m.id, m.content, u.full_name as sender_name FROM chat_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = $1`,
        [replyToId]
      );
      if (replySnippet.rows[0]) {
        enriched.reply_to = {
          id: replySnippet.rows[0].id,
          content: replySnippet.rows[0].content?.substring(0, 100),
          sender_name: replySnippet.rows[0].sender_name,
        };
      }
    }

    emitToConversation(conversationId, 'message:new', enriched);
    return enriched;
  }

  // ── Edit message ────────────────────────────────────────────────────
  async editMessage(conversationId: string, messageId: string, content: string, userId: string) {
    const msg = await query(
      'SELECT sender_id FROM chat_messages WHERE id = $1 AND conversation_id = $2 AND is_deleted = FALSE',
      [messageId, conversationId]
    );
    if (!msg.rows.length) throw new AppError('Message not found', 404, 'NOT_FOUND');
    if (msg.rows[0].sender_id !== userId) throw new AppError('Can only edit your own messages', 403, 'FORBIDDEN');

    const result = await query(
      'UPDATE chat_messages SET content = $1, edited_at = NOW() WHERE id = $2 RETURNING *',
      [content, messageId]
    );

    emitToConversation(conversationId, 'message:edited', { messageId, content, edited_at: result.rows[0].edited_at });
    return result.rows[0];
  }

  // ── Delete message ──────────────────────────────────────────────────
  async deleteMessage(conversationId: string, messageId: string, userId: string, userRole: string) {
    const msg = await query(
      'SELECT sender_id FROM chat_messages WHERE id = $1 AND conversation_id = $2',
      [messageId, conversationId]
    );
    if (!msg.rows.length) throw new AppError('Message not found', 404, 'NOT_FOUND');
    // Allow deleting own messages or admin/supervisor can delete any
    if (msg.rows[0].sender_id !== userId && !['admin', 'supervisor'].includes(userRole)) {
      throw new AppError('Cannot delete this message', 403, 'FORBIDDEN');
    }

    await query('UPDATE chat_messages SET is_deleted = TRUE WHERE id = $1', [messageId]);
    emitToConversation(conversationId, 'message:deleted', { messageId });
    return { message: 'Message deleted' };
  }

  // ── Add reaction ────────────────────────────────────────────────────
  async addReaction(conversationId: string, messageId: string, emoji: string, userId: string) {
    // Verify membership
    const member = await query(
      'SELECT id FROM chat_members WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
      [conversationId, userId]
    );
    if (!member.rows.length) throw new AppError('Not a member', 403, 'FORBIDDEN');

    await query(
      `INSERT INTO chat_message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
      [messageId, userId, emoji]
    );

    const userName = await query('SELECT full_name FROM users WHERE id = $1', [userId]);
    emitToConversation(conversationId, 'reaction:added', {
      messageId, emoji, user_id: userId, user_name: userName.rows[0]?.full_name,
    });
    return { message: 'Reaction added' };
  }

  // ── Remove reaction ─────────────────────────────────────────────────
  async removeReaction(conversationId: string, messageId: string, emoji: string, userId: string) {
    await query(
      'DELETE FROM chat_message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
      [messageId, userId, emoji]
    );
    emitToConversation(conversationId, 'reaction:removed', { messageId, emoji, user_id: userId });
    return { message: 'Reaction removed' };
  }

  // ── Update conversation ─────────────────────────────────────────────
  async updateConversation(conversationId: string, data: { name?: string; description?: string }, userId: string) {
    // Only admins of the conversation can update
    const member = await query(
      'SELECT is_admin FROM chat_members WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
      [conversationId, userId]
    );
    if (!member.rows.length || !member.rows[0].is_admin) {
      throw new AppError('Only conversation admins can update', 403, 'FORBIDDEN');
    }

    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (data.name !== undefined) { sets.push(`name = $${idx++}`); params.push(data.name); }
    if (data.description !== undefined) { sets.push(`description = $${idx++}`); params.push(data.description); }
    if (sets.length === 0) throw new AppError('No fields to update', 400, 'VALIDATION_ERROR');

    sets.push(`updated_at = NOW()`);
    params.push(conversationId);

    const result = await query(
      `UPDATE chat_conversations SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    emitToConversation(conversationId, 'conversation:updated', result.rows[0]);
    return result.rows[0];
  }

  // ── Delete (archive) conversation ───────────────────────────────────
  async deleteConversation(conversationId: string, userId: string) {
    const member = await query(
      'SELECT is_admin FROM chat_members WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
      [conversationId, userId]
    );
    if (!member.rows.length || !member.rows[0].is_admin) {
      throw new AppError('Only conversation admins can delete', 403, 'FORBIDDEN');
    }

    await query('UPDATE chat_conversations SET is_archived = TRUE, updated_at = NOW() WHERE id = $1', [conversationId]);
    emitToConversation(conversationId, 'conversation:deleted', { conversationId });
    return { message: 'Conversation archived' };
  }

  // ── Get conversation members ────────────────────────────────────────
  async getConversationMembers(conversationId: string, userId: string) {
    const member = await query(
      'SELECT id FROM chat_members WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
      [conversationId, userId]
    );
    if (!member.rows.length) throw new AppError('Not a member', 403, 'FORBIDDEN');

    const data = await query(
      `SELECT cm.user_id, cm.is_admin, cm.joined_at, u.full_name, u.email, u.role, u.profile_image_path as profile_image_url, u.last_seen_at
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.conversation_id = $1 AND cm.left_at IS NULL
       ORDER BY cm.is_admin DESC, u.full_name`,
      [conversationId]
    );
    return data.rows;
  }

  // ── Add members ─────────────────────────────────────────────────────
  async addMembers(conversationId: string, memberIds: string[], userId: string) {
    const member = await query(
      'SELECT is_admin FROM chat_members WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
      [conversationId, userId]
    );
    if (!member.rows.length || !member.rows[0].is_admin) {
      throw new AppError('Only conversation admins can add members', 403, 'FORBIDDEN');
    }

    const conv = await query('SELECT type FROM chat_conversations WHERE id = $1', [conversationId]);
    if (conv.rows[0]?.type === 'direct') throw new AppError('Cannot add members to direct messages', 400, 'VALIDATION_ERROR');

    for (const memberId of memberIds) {
      // Re-join if previously left, or insert new
      const existing = await query(
        'SELECT id, left_at FROM chat_members WHERE conversation_id = $1 AND user_id = $2',
        [conversationId, memberId]
      );
      if (existing.rows.length && existing.rows[0].left_at) {
        await query('UPDATE chat_members SET left_at = NULL WHERE id = $1', [existing.rows[0].id]);
      } else if (!existing.rows.length) {
        await query('INSERT INTO chat_members (conversation_id, user_id) VALUES ($1, $2)', [conversationId, memberId]);
        await query('INSERT INTO chat_member_state (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [conversationId, memberId]);
      }
      joinConversationRoom(conversationId, memberId);
      emitToUser(memberId, 'conversation:new', conv.rows[0]);
    }

    emitToConversation(conversationId, 'members:added', { memberIds });
    return { message: 'Members added' };
  }

  // ── Remove member ───────────────────────────────────────────────────
  async removeMember(conversationId: string, targetUserId: string, userId: string) {
    const member = await query(
      'SELECT is_admin FROM chat_members WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
      [conversationId, userId]
    );
    // Can remove yourself, or admins can remove others
    if (targetUserId !== userId && (!member.rows.length || !member.rows[0].is_admin)) {
      throw new AppError('Only admins can remove other members', 403, 'FORBIDDEN');
    }

    await query('UPDATE chat_members SET left_at = NOW() WHERE conversation_id = $1 AND user_id = $2', [conversationId, targetUserId]);
    emitToConversation(conversationId, 'members:removed', { userId: targetUserId });
    emitToUser(targetUserId, 'conversation:removed', { conversationId });
    return { message: 'Member removed' };
  }

  // ── Promote member ──────────────────────────────────────────────────
  async promoteMember(conversationId: string, targetUserId: string, userId: string) {
    const member = await query(
      'SELECT is_admin FROM chat_members WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
      [conversationId, userId]
    );
    if (!member.rows.length || !member.rows[0].is_admin) {
      throw new AppError('Only admins can promote members', 403, 'FORBIDDEN');
    }

    await query(
      'UPDATE chat_members SET is_admin = TRUE WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, targetUserId]
    );
    emitToConversation(conversationId, 'member:promoted', { userId: targetUserId });
    return { message: 'Member promoted' };
  }

  // ── Toggle pin ──────────────────────────────────────────────────────
  async togglePin(conversationId: string, userId: string) {
    const state = await query(
      'SELECT is_pinned FROM chat_member_state WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    const newVal = state.rows.length ? !state.rows[0].is_pinned : true;

    await query(
      `INSERT INTO chat_member_state (conversation_id, user_id, is_pinned)
       VALUES ($1, $2, $3)
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET is_pinned = $3`,
      [conversationId, userId, newVal]
    );
    return { is_pinned: newVal };
  }

  // ── Search conversations ────────────────────────────────────────────
  async searchConversations(userId: string, searchQuery: string) {
    // Search by conversation name or message content
    const data = await query(
      `SELECT DISTINCT cc.id, cc.type, cc.name, cc.description, cc.last_message_at, cc.last_message_preview
       FROM chat_conversations cc
       JOIN chat_members cm ON cm.conversation_id = cc.id AND cm.user_id = $1 AND cm.left_at IS NULL
       LEFT JOIN chat_messages msg ON msg.conversation_id = cc.id AND msg.is_deleted = FALSE
       WHERE cc.is_archived = FALSE
         AND (cc.name ILIKE $2 OR msg.content_tsv @@ plainto_tsquery('english', $3))
       ORDER BY cc.last_message_at DESC NULLS LAST
       LIMIT 20`,
      [userId, `%${searchQuery}%`, searchQuery]
    );
    return data.rows;
  }

  // ── Upload attachment ───────────────────────────────────────────────
  async uploadAttachment(conversationId: string, messageData: any, userId: string) {
    const msg = await this.sendMessage(conversationId, messageData.content || null, userId);

    const result = await query(
      `INSERT INTO chat_message_attachments (message_id, file_name, file_path, file_size_bytes, mime_type)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [msg.id, messageData.file_name, messageData.file_path || `chat/${conversationId}/${messageData.file_name}`,
       messageData.file_size_bytes, messageData.mime_type]
    );

    const attachment = result.rows[0];
    emitToConversation(conversationId, 'message:attachment', { messageId: msg.id, attachment });
    return { message: msg, attachment };
  }

  // ── Mark read ───────────────────────────────────────────────────────
  async markRead(conversationId: string, userId: string) {
    await query(
      `INSERT INTO chat_member_state (conversation_id, user_id, last_read_at) VALUES ($1, $2, NOW())
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = NOW()`,
      [conversationId, userId]
    );
    emitToConversation(conversationId, 'read:update', { conversationId, userId, read_at: new Date().toISOString() });
    return { message: 'Marked as read' };
  }

  // ── List all conversations (admin) ──────────────────────────────────
  async listAllConversations() {
    const data = await query(
      `SELECT cc.*,
              (SELECT COUNT(*)::int FROM chat_messages WHERE conversation_id = cc.id AND is_deleted = FALSE) as message_count,
              (SELECT COUNT(*)::int FROM chat_members WHERE conversation_id = cc.id AND left_at IS NULL) as member_count
       FROM chat_conversations cc ORDER BY cc.updated_at DESC`
    );
    return data.rows;
  }

  // ── Get messages for admin (no membership check) ────────────────────
  async getMessagesForAdmin(conversationId: string, cursor?: string, limit = 50) {
    const conditions = ['m.conversation_id = $1'];
    const params: any[] = [conversationId];
    let idx = 2;

    if (cursor) { conditions.push(`m.created_at < $${idx++}`); params.push(cursor); }
    params.push(limit);

    const data = await query(
      `SELECT m.*, u.full_name as sender_name, u.profile_image_path as sender_avatar
       FROM chat_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY m.created_at DESC LIMIT $${idx}`,
      params
    );
    return { messages: data.rows, nextCursor: data.rows.length === limit ? data.rows[data.rows.length - 1].created_at : null };
  }

  // ── Get presence (online users) ─────────────────────────────────────
  getPresence() {
    return { online: getOnlineUsers() };
  }

  // ── List active users (for chat user picker) ───────────────────────
  async listUsers(search?: string) {
    const conditions = ['is_active = TRUE'];
    const params: any[] = [];
    let idx = 1;
    if (search) {
      conditions.push(`(full_name ILIKE $${idx} OR email ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    const data = await query(
      `SELECT id, full_name, email, role, profile_image_path as profile_image_url, last_seen_at
       FROM users WHERE ${conditions.join(' AND ')} ORDER BY full_name LIMIT 50`,
      params
    );
    return data.rows;
  }
}
