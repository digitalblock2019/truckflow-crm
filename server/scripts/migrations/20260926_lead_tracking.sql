-- =============================================================================
-- Lead tracking: sleeping leads + last-updated attribution
-- =============================================================================
-- Run in the Supabase SQL editor (local psql can't reach the DB).
-- Idempotent: re-runnable.
--
-- What it does:
--   1. Adds 'sleeping_lead' to the trucker_status enum — the home for the
--      second Google Sheet (truckers who reply slowly / intermittently).
--   2. Adds truckers.updated_by so every edit is attributable, not just
--      timestamped (updated_at already exists).
--
-- BEFORE RUNNING, sanity-check the live enum:
--   SELECT unnest(enum_range(NULL::trucker_status));
-- 'imported' is written by the app (truckers.service.ts) but isn't declared
-- in the tracked schema or any migration file — it was likely added by a
-- manual ALTER. Confirm the live enum matches what the code expects.
--
-- NOTE: a newly added enum value cannot be USED in the same transaction that
-- adds it. Step 1 must commit before anything writes a 'sleeping_lead' row.
-- Run this file on its own, before any data migration that uses the value.
-- =============================================================================

-- ------------------------------------------------------------------------
-- 1. Extend trucker_status enum
-- ------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TYPE trucker_status ADD VALUE IF NOT EXISTS 'sleeping_lead';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------------------
-- 2. truckers.updated_by
--
-- Nullable on purpose: self-onboarding form submissions are made by the
-- trucker, not a CRM user, so there is no users row to attribute them to.
-- ------------------------------------------------------------------------
ALTER TABLE truckers ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id);
