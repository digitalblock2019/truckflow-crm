-- Run in Supabase SQL editor.
-- Adds dual US/Canada entity fields to invoice_branding so all transactional
-- emails (not just invoices) can show a proper legal footer.
ALTER TABLE invoice_branding
  ADD COLUMN IF NOT EXISTS us_legal_name TEXT,
  ADD COLUMN IF NOT EXISTS us_address TEXT,
  ADD COLUMN IF NOT EXISTS ca_legal_name TEXT,
  ADD COLUMN IF NOT EXISTS ca_address TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

-- Seed the default US/Canada entity info + contact details. Creates the
-- branding row if none exists yet, otherwise updates the existing one.
-- Safe to re-run.
--
-- company_name doubles as the email "From" display name (e.g.
-- "Universal Dispatchers <noreply@truckflowcrm.com>") — TruckFlow is the
-- internal tool name, not the customer-facing brand, so this is deliberately
-- not "TruckFlow".
INSERT INTO invoice_branding (company_name, company_phone, company_email, us_legal_name, us_address, ca_legal_name, ca_address)
SELECT 'Universal Dispatchers', '+1 (909) 203-1063', 'hello@universaldispatchers.com',
       'Universal Fleet Services LLC', '312 W. 2nd St, Casper, WY 82601',
       '12192934 Canada Inc.', '201-1065 Canadian Place, Mississauga, ON L4W0C2, Canada'
WHERE NOT EXISTS (SELECT 1 FROM invoice_branding);

UPDATE invoice_branding SET
  company_name = 'Universal Dispatchers',
  company_phone = '+1 (909) 203-1063',
  company_email = 'hello@universaldispatchers.com',
  us_legal_name = 'Universal Fleet Services LLC',
  us_address = '312 W. 2nd St, Casper, WY 82601',
  ca_legal_name = '12192934 Canada Inc.',
  ca_address = '201-1065 Canadian Place, Mississauga, ON L4W0C2, Canada';
