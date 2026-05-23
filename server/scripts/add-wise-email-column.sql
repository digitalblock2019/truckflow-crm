-- Safety-belt migration: ensure invoice_branding.wise_email exists.
--
-- The Settings → Invoice Branding form has had a "Wise Email" field for
-- a while, and the dynamic updateBranding() backend writes any column
-- name through. If the column was added to the live DB previously,
-- this is a no-op. If not, this creates it so the Wise payment option
-- on the invoice view + email actually has a place to read from.
--
-- HOW TO RUN: paste into the Supabase SQL editor and run.

ALTER TABLE invoice_branding ADD COLUMN IF NOT EXISTS wise_email CITEXT;
