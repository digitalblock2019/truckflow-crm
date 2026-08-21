-- =============================================================================
-- Trucker Self-Onboarding — Phase A
-- =============================================================================
-- Migration for the tokenized self-onboarding link feature.
-- Run in the Supabase SQL editor (local psql can't reach the DB).
-- Idempotent: re-runnable.
--
-- What it does:
--   1. Extends trucker_status enum with 4 new values.
--   2. Makes truckers.mc_number NULLABLE + swaps UNIQUE for partial unique
--      index (Path B agent-initiated new-trucker flow creates prospects
--      before an MC# is known).
--   3. Creates trucker_onboarding_requests   (one row per link sent).
--   4. Creates trucker_pending_docs          (what the trucker marked
--                                              "provide later").
--   5. Creates the "Self Onboarding Requests" chat group and adds all
--      current admins as members.
-- =============================================================================

-- ------------------------------------------------------------------------
-- 1. Extend trucker_status enum
-- ------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE trucker_status ADD VALUE IF NOT EXISTS 'self_onboarding_sent';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE trucker_status ADD VALUE IF NOT EXISTS 'self_onboarding_submitted';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE trucker_status ADD VALUE IF NOT EXISTS 'self_onboarding_expired';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE trucker_status ADD VALUE IF NOT EXISTS 'duplicate_of';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------------------
-- 2. truckers.mc_number: nullable + partial unique index
--
-- Order of operations matters: drop the old UNIQUE constraint first (which
-- also drops its backing index), then alter the column, then create the
-- new partial index. Every step is idempotent.
-- ------------------------------------------------------------------------

-- Old constraint name comes from the schema definition (auto-generated
-- as truckers_mc_number_key). Guard so re-run doesn't error.
DO $$ BEGIN
  ALTER TABLE truckers DROP CONSTRAINT IF EXISTS truckers_mc_number_key;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

ALTER TABLE truckers ALTER COLUMN mc_number DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_truckers_mc_unique
  ON truckers(mc_number)
  WHERE mc_number IS NOT NULL;

-- Optional — for the "prospect" state we may want to know at a glance which
-- truckers still lack an MC#. Cheap partial index.
CREATE INDEX IF NOT EXISTS idx_truckers_mc_null
  ON truckers(created_at DESC)
  WHERE mc_number IS NULL;

-- Duplicate-linking column: when a Path B/C submission collides with an
-- existing MC#, we mark the prospect as duplicate_of the existing trucker.
-- Kept separate from status so the audit trail survives status changes.
ALTER TABLE truckers
  ADD COLUMN IF NOT EXISTS duplicate_of_trucker_id UUID
    REFERENCES truckers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_truckers_duplicate_of
  ON truckers(duplicate_of_trucker_id)
  WHERE duplicate_of_trucker_id IS NOT NULL;

-- ------------------------------------------------------------------------
-- 3. trucker_onboarding_requests — one row per link sent
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trucker_onboarding_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trucker_id        UUID NOT NULL REFERENCES truckers(id) ON DELETE CASCADE,

  -- SHA-256 of the raw URL token. Raw token shown to trucker via email
  -- once; server keeps only the hash. Same pattern as StaffSense.
  token_hash        TEXT NOT NULL UNIQUE,

  -- Which channels the send actually went out on. Snapshot — future
  -- edits to the trucker's contact fields don't rewrite history.
  sent_via          TEXT[] NOT NULL DEFAULT '{}',    -- {'email'} / {'email','sms'}
  sent_to_email     CITEXT,
  sent_to_phone     TEXT,

  custom_message    TEXT,
  expires_at        TIMESTAMPTZ NOT NULL,

  -- Lifecycle: sent -> opened -> submitted, OR sent -> expired, OR sent -> revoked
  status            TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent','opened','submitted','expired','revoked')),

  sent_by           UUID NOT NULL REFERENCES users(id),
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at         TIMESTAMPTZ,
  submitted_at      TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  revoked_by        UUID REFERENCES users(id),

  -- E-signature capture at submission time (legal record)
  signed_name       TEXT,
  signed_ip         INET,
  signed_user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_onboarding_reqs_trucker
  ON trucker_onboarding_requests(trucker_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_onboarding_reqs_status
  ON trucker_onboarding_requests(status, expires_at);

-- ------------------------------------------------------------------------
-- 4. trucker_pending_docs — docs the trucker deferred at submit time
-- ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trucker_pending_docs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trucker_id         UUID NOT NULL REFERENCES truckers(id) ON DELETE CASCADE,
  document_type_id   UUID NOT NULL REFERENCES trucker_document_types(id),

  requested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requested_via      TEXT NOT NULL DEFAULT 'self_onboarding'
    CHECK (requested_via IN ('self_onboarding','agent')),

  -- When the agent (or trucker via a follow-up flow) finally uploads
  -- the missing doc, we set resolved_at instead of deleting the row —
  -- keeps the record that it was originally deferred.
  resolved_at        TIMESTAMPTZ,

  UNIQUE (trucker_id, document_type_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_docs_trucker
  ON trucker_pending_docs(trucker_id)
  WHERE resolved_at IS NULL;

-- ------------------------------------------------------------------------
-- 5. Seed the "Self Onboarding Requests" chat group + auto-add admins.
--
-- Uses the first admin user as created_by (schema requires a real users.id).
-- If no admin exists yet, this section skips silently — re-run after
-- creating one.
-- ------------------------------------------------------------------------
DO $$
DECLARE
  first_admin_id UUID;
  conv_id UUID;
BEGIN
  SELECT id INTO first_admin_id
  FROM users
  WHERE role = 'admin' AND is_active = TRUE
  ORDER BY created_at ASC
  LIMIT 1;

  IF first_admin_id IS NULL THEN
    RAISE NOTICE '[self_onboarding] no admin user found; skipping chat group seed';
    RETURN;
  END IF;

  -- Only insert if not present (by name — enforced by uniqueness convention,
  -- not a DB constraint, since chat_conversations.name isn't UNIQUE).
  SELECT id INTO conv_id
  FROM chat_conversations
  WHERE type = 'group' AND name = 'Self Onboarding Requests'
  LIMIT 1;

  IF conv_id IS NULL THEN
    INSERT INTO chat_conversations (type, name, created_by)
    VALUES ('group', 'Self Onboarding Requests', first_admin_id)
    RETURNING id INTO conv_id;

    RAISE NOTICE '[self_onboarding] created chat group %', conv_id;
  END IF;

  -- Add every active admin as a member (idempotent via UNIQUE constraint).
  INSERT INTO chat_members (conversation_id, user_id, is_admin)
  SELECT conv_id, u.id, TRUE
  FROM users u
  WHERE u.role = 'admin' AND u.is_active = TRUE
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
END $$;

-- ------------------------------------------------------------------------
-- Done. Sanity check.
-- ------------------------------------------------------------------------
SELECT 'trucker_onboarding_requests' AS table_name,
       count(*)::int AS row_count
FROM trucker_onboarding_requests
UNION ALL
SELECT 'trucker_pending_docs',
       count(*)::int
FROM trucker_pending_docs
UNION ALL
SELECT 'self_onboarding_chat_group_members',
       count(*)::int
FROM chat_members cm
JOIN chat_conversations cc ON cc.id = cm.conversation_id
WHERE cc.name = 'Self Onboarding Requests';
-- Expected on a fresh run: 0, 0, N (where N = active admin count)
