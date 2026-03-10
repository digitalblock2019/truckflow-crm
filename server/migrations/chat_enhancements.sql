-- Chat enhancements migration
ALTER TABLE chat_member_state ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS last_message_preview TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
