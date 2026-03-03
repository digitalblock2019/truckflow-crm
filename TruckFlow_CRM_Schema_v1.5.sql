-- ============================================================
--  TRUCKFLOW CRM — PostgreSQL Database Schema
--  Version 1.5 | February 2026
--  Matches PRD v1.8 Final
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid(), pgp_sym_encrypt()
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive text for emails

-- ============================================================
--  ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM (
  'admin',
  'supervisor',
  'sales_agent',
  'dispatcher',
  'viewer'
);

CREATE TYPE employee_type AS ENUM (
  'sales_agent',
  'dispatcher',
  'fixed_salary',
  'contractor'
);

CREATE TYPE employment_status AS ENUM (
  'active',
  'on_leave',
  'terminated'
);

CREATE TYPE pay_type AS ENUM (
  'salary_only',
  'salary_plus_commission',
  'commission_only',
  'contractor_rate'
);

CREATE TYPE pay_frequency AS ENUM (
  'weekly',
  'biweekly',
  'semi_monthly',
  'monthly'
);

CREATE TYPE commission_type AS ENUM (
  'percentage',   -- % of company gross commission
  'flat'          -- flat $ amount (future use)
);

CREATE TYPE payment_method AS ENUM (
  'direct_deposit',
  'e_transfer',
  'cheque',
  'other'
);

CREATE TYPE termination_reason AS ENUM (
  'resignation',
  'performance',
  'redundancy',
  'contract_end',
  'other'
);

CREATE TYPE performance_note_type AS ENUM (
  'general_note',
  'verbal_warning',
  'written_warning',
  'final_warning',
  'commendation'
);

CREATE TYPE leave_type AS ENUM (
  'sick',
  'annual',
  'emergency',
  'unpaid',
  'other'
);

CREATE TYPE leave_status AS ENUM (
  'pending',
  'approved',
  'rejected'
);

CREATE TYPE trucker_status AS ENUM (
  'called',
  'sms_sent',
  'response_picked_up',
  'response_no_answer',
  'response_not_in_use',
  'interested',
  'not_interested',
  'onboarded'
  -- custom statuses stored in trucker_custom_statuses table
);

CREATE TYPE onboarding_doc_status AS ENUM (
  'not_uploaded',
  'uploaded',
  'replaced'
);

CREATE TYPE load_status AS ENUM (
  'pending',
  'dispatched',
  'in_transit',
  'delivered',
  'payment_received',
  'exchange_rate_locked',  -- when USD/PKR rate is locked at Payment Received
  'exchange_rate_manual'   -- when Admin enters manual fallback rate
);

CREATE TYPE commission_status AS ENUM (
  'pending',
  'approved',
  'paid',
  'excluded'
);

CREATE TYPE agent_eligibility_status AS ENUM (
  'eligible',         -- within threshold, commission owed
  'threshold_reached',-- hit load limit naturally
  'agent_terminated', -- entitlement cleared on termination
  'not_applicable'    -- no agent assigned
);

CREATE TYPE doc_category AS ENUM (
  'trucker_onboarding',
  'hr_employee'
);

CREATE TYPE audit_action AS ENUM (
  'login',
  'logout',
  'create',
  'update',
  'delete',
  'upload',
  'download',
  'email_forward',
  'status_change',
  'commission_change',
  'termination',
  'bank_detail_change',
  'bank_detail_reveal',
  'threshold_change',
  'onboarding_initiated',
  'payment_received',
  'exchange_rate_locked',  -- when USD/PKR rate is locked at Payment Received
  'exchange_rate_manual'   -- when Admin enters manual fallback rate
);

CREATE TYPE notification_channel AS ENUM (
  'in_app',
  'email'
);

-- ============================================================
--  1. USERS  (CRM login accounts)
-- ============================================================

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             CITEXT UNIQUE NOT NULL,
  full_name         TEXT NOT NULL,
  role              user_role NOT NULL,
  employee_id       UUID,                        -- FK to employees (nullable for admin-only accounts)
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role  ON users(role);

-- ============================================================
--  2. EMPLOYEES  (HR records — all staff types)
-- ============================================================

CREATE TABLE employees (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_number       TEXT UNIQUE NOT NULL,        -- e.g. EMP-0012, auto-generated
  full_name             TEXT NOT NULL,
  date_of_birth         DATE,
  personal_email        CITEXT,
  phone                 TEXT,
  home_address          TEXT,
  emergency_contact_name      TEXT,
  emergency_contact_phone     TEXT,
  emergency_contact_relation  TEXT,

  -- Employment
  job_title             TEXT,
  department            TEXT,
  employee_type         employee_type NOT NULL,
  employment_status     employment_status NOT NULL DEFAULT 'active',
  start_date            DATE,
  crm_user_id           UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL for non-CRM staff

  -- Government ID (stored as plain text, access controlled at app layer)
  id_passport_number    TEXT,
  work_authorization    TEXT,                        -- citizen / pr / work_permit / visa
  work_permit_expiry    DATE,

  -- Compensation (current, active record)
  pay_type              pay_type NOT NULL DEFAULT 'salary_only',
  base_salary_pkr_paisa INTEGER,                     -- salary in Pakistani Rupees stored as paisa (PKR × 100) to avoid float issues
  pay_frequency         pay_frequency,
  commission_type       commission_type,
  commission_value      NUMERIC(6,4),                -- e.g. 0.1000 = 10%
  compensation_effective_date DATE,

  -- Termination
  termination_date      DATE,
  termination_reason    termination_reason,
  termination_notes     TEXT,
  final_settlement_pkr_paisa INTEGER,               -- final payout in PKR paisa. Exported to ExpenseDeck.

  internal_notes        TEXT,

  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_employees_number ON employees(employee_number);
CREATE INDEX idx_employees_status        ON employees(employment_status);
CREATE INDEX idx_employees_type          ON employees(employee_type);
CREATE INDEX idx_employees_crm_user      ON employees(crm_user_id);

-- Auto-generate employee number trigger
CREATE SEQUENCE employee_seq START 1;
CREATE OR REPLACE FUNCTION generate_employee_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.employee_number := 'EMP-' || LPAD(NEXTVAL('employee_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employee_number
  BEFORE INSERT ON employees
  FOR EACH ROW
  WHEN (NEW.employee_number IS NULL OR NEW.employee_number = '')
  EXECUTE FUNCTION generate_employee_number();

-- ============================================================
--  3. EMPLOYEE BANK DETAILS  (encrypted, separate table)
-- ============================================================
-- Stored in a separate table so access can be tightly controlled
-- and so audit queries on the employees table don't surface sensitive data.
-- account_number and routing_number are encrypted using pgp_sym_encrypt.

CREATE TABLE employee_bank_details (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  bank_name         TEXT,
  account_holder    TEXT,
  account_number_encrypted    BYTEA,   -- pgp_sym_encrypt(account_number, app_secret)
  routing_number_encrypted    BYTEA,   -- pgp_sym_encrypt(routing_number, app_secret)
  account_type      TEXT,              -- 'checking' | 'savings'
  payment_method    payment_method NOT NULL DEFAULT 'direct_deposit',
  currency          TEXT NOT NULL DEFAULT 'USD',
  updated_by        UUID REFERENCES users(id),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_bank_details_employee ON employee_bank_details(employee_id);

-- ============================================================
--  4. EMPLOYEE PAY HISTORY  (immutable change log)
-- ============================================================

CREATE TABLE employee_pay_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  field_changed   TEXT NOT NULL,      -- 'base_salary_pkr_paisa' | 'commission_value' | 'pay_frequency' etc.
  old_value       TEXT,               -- serialized as text for all types
  new_value       TEXT,
  effective_date  DATE,
  changed_by      UUID NOT NULL REFERENCES users(id),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT
);

CREATE INDEX idx_pay_history_employee ON employee_pay_history(employee_id);
CREATE INDEX idx_pay_history_changed_at ON employee_pay_history(changed_at);

-- ============================================================
--  5. EMPLOYEE PERFORMANCE NOTES  (immutable)
-- ============================================================

CREATE TABLE employee_performance_notes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  note_type     performance_note_type NOT NULL,
  content       TEXT NOT NULL,
  addendum      TEXT,               -- corrections appended, never overwrite
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NOTE: no updated_at — these are intentionally immutable
);

CREATE INDEX idx_perf_notes_employee ON employee_performance_notes(employee_id);

-- ============================================================
--  6. EMPLOYEE LEAVE REQUESTS
-- ============================================================

CREATE TABLE employee_leave_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type      leave_type NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  total_days      INTEGER GENERATED ALWAYS AS (end_date - start_date + 1) STORED,
  reason          TEXT NOT NULL,
  status          leave_status NOT NULL DEFAULT 'pending',
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  decision_notes  TEXT,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leave_employee   ON employee_leave_requests(employee_id);
CREATE INDEX idx_leave_status     ON employee_leave_requests(status);
CREATE INDEX idx_leave_dates      ON employee_leave_requests(start_date, end_date);

-- ============================================================
--  7. TRUCKER CUSTOM STATUSES  (admin-managed)
-- ============================================================

CREATE TABLE trucker_custom_statuses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         TEXT NOT NULL,
  color_hex     TEXT,               -- e.g. '#7D3C98' for row highlight
  is_archived   BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
--  8. TRUCKER UPLOADS  (batches from Excel/CSV)
-- ============================================================

CREATE TABLE trucker_upload_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename        TEXT NOT NULL,
  column_mapping  JSONB,             -- stores the user's column→field mapping from the UI step
  rows_added      INTEGER NOT NULL DEFAULT 0,
  rows_skipped    INTEGER NOT NULL DEFAULT 0,
  rows_errored    INTEGER NOT NULL DEFAULT 0,
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
--  9. TRUCKERS  (core record)
-- ============================================================

CREATE TABLE truckers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mc_number               TEXT UNIQUE NOT NULL,
  dot_number              TEXT,

  -- FMCSA / scraper data (imported from Excel)
  legal_name              TEXT NOT NULL,       -- LegalName column — formerly company_name
  dba_name                TEXT,                -- DBA column — trade name if different from legal name
  entity_type             fmcsa_entity_type,   -- EntityType column
  operation_class         fmcsa_operation_class, -- OperationClass column
  fmcsa_operating_status  fmcsa_operating_status, -- OperatingStatus column — FMCSA status, separate from CRM status
  out_of_service_date     DATE,                -- OutOfServiceDate column — nullable
  mcs150_date             DATE,                -- MCS-150 Date column — last FMCSA filing date
  power_units             INTEGER,             -- PowerUnits column — number of trucks/tractors
  driver_count            INTEGER,             -- Drivers column
  vehicle_inspections     INTEGER,             -- VehicleInspections column — FMCSA inspection count
  driver_inspections      INTEGER,             -- DriverInspections column — FMCSA inspection count

  -- CRM fields
  owner_driver_name TEXT,
  phone             TEXT,
  email             CITEXT,
  truck_type        TEXT,                      -- Flatbed, Dry Van, Reefer etc — CRM-entered
  state             TEXT,                      -- Derived from PhysicalAddress on import
  physical_address  TEXT,                      -- PhysicalAddress column — full address string
  notes             TEXT,

  -- Status: either a system enum value OR a custom status id (one must be set)
  status_system     trucker_status,
  status_custom_id  UUID REFERENCES trucker_custom_statuses(id),

  -- Assignment
  assigned_agent_id UUID REFERENCES employees(id),  -- Sales Agent assigned

  -- Commission % negotiated with this trucker
  company_commission_pct  NUMERIC(5,4) NOT NULL DEFAULT 0.08,  -- e.g. 0.08 = 8%

  -- Onboarding
  onboarding_initiated_at TIMESTAMPTZ,
  onboarding_initiated_by UUID REFERENCES users(id),
  fully_onboarded_at      TIMESTAMPTZ,

  upload_batch_id   UUID REFERENCES trucker_upload_batches(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_status CHECK (
    (status_system IS NOT NULL AND status_custom_id IS NULL) OR
    (status_system IS NULL     AND status_custom_id IS NOT NULL)
  )
);

CREATE INDEX idx_truckers_mc        ON truckers(mc_number);
CREATE INDEX idx_truckers_status    ON truckers(status_system);
CREATE INDEX idx_truckers_agent     ON truckers(assigned_agent_id);
CREATE INDEX idx_truckers_phone              ON truckers(phone);
CREATE INDEX idx_truckers_fmcsa_status        ON truckers(fmcsa_operating_status);
CREATE INDEX idx_truckers_legal_name          ON truckers(legal_name);
CREATE INDEX idx_truckers_dba                 ON truckers(dba_name);

-- ============================================================
--  10. TRUCKER STATUS HISTORY  (audit trail for status changes)
-- ============================================================

CREATE TABLE trucker_status_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trucker_id      UUID NOT NULL REFERENCES truckers(id) ON DELETE CASCADE,
  old_status_system   trucker_status,
  old_status_custom_id UUID REFERENCES trucker_custom_statuses(id),
  new_status_system   trucker_status,
  new_status_custom_id UUID REFERENCES trucker_custom_statuses(id),
  comment         TEXT,
  changed_by      UUID NOT NULL REFERENCES users(id),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_status_history_trucker ON trucker_status_history(trucker_id);

-- ============================================================
--  11. TRUCKER DOCUMENTS  (onboarding checklist)
-- ============================================================

-- Fixed document type definitions
CREATE TABLE trucker_document_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,   -- e.g. 'mc_authority_letter'
  label           TEXT NOT NULL,          -- e.g. 'MC Authority Letter'
  is_required     BOOLEAN NOT NULL DEFAULT TRUE,
  is_conditional  BOOLEAN NOT NULL DEFAULT FALSE,   -- e.g. NOA — only if factoring
  is_optional     BOOLEAN NOT NULL DEFAULT FALSE,   -- e.g. Fuel Card Agreement
  sort_order      INTEGER NOT NULL DEFAULT 0
);

INSERT INTO trucker_document_types (slug, label, is_required, is_conditional, is_optional, sort_order) VALUES
  ('mc_authority_letter',      'MC Authority Letter',              TRUE,  FALSE, FALSE,  1),
  ('w9_form',                  'W-9 Form',                         TRUE,  FALSE, FALSE,  2),
  ('cdl_copy',                 'CDL Copy (Front & Back)',          TRUE,  FALSE, FALSE,  3),
  ('truck_registration',       'Truck Registration',               TRUE,  FALSE, FALSE,  4),
  ('certificate_of_insurance', 'Certificate of Insurance (COI)',   TRUE,  FALSE, FALSE,  5),
  ('void_cheque',              'Void Cheque / Direct Deposit Form',TRUE,  FALSE, FALSE,  6),
  ('carrier_agreement',        'Carrier Agreement / Contract',     TRUE,  FALSE, FALSE,  7),
  ('rate_confirmation',        'Rate Confirmation Template',       TRUE,  FALSE, FALSE,  8),
  ('eld_compliance',           'ELD Compliance Proof',             TRUE,  FALSE, FALSE,  9),
  ('ifta_license',             'IFTA License',                     TRUE,  FALSE, FALSE, 10),
  ('noa',                      'NOA - Notice of Assignment',       FALSE, TRUE,  FALSE, 11),
  ('fuel_card_agreement',      'Fuel Card Agreement',              FALSE, FALSE, TRUE,  12);

CREATE TABLE trucker_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trucker_id          UUID NOT NULL REFERENCES truckers(id) ON DELETE CASCADE,
  document_type_id    UUID NOT NULL REFERENCES trucker_document_types(id),
  file_name           TEXT NOT NULL,
  file_path           TEXT NOT NULL,   -- S3/R2 object key
  file_size_bytes     INTEGER,
  mime_type           TEXT,
  uploaded_by         UUID NOT NULL REFERENCES users(id),
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_current          BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE for replaced versions
  replaced_at         TIMESTAMPTZ,
  replaced_by         UUID REFERENCES users(id),
  UNIQUE (trucker_id, document_type_id, is_current)   -- one current doc per type per trucker
);

CREATE INDEX idx_trucker_docs_trucker ON trucker_documents(trucker_id);
CREATE INDEX idx_trucker_docs_current ON trucker_documents(trucker_id, is_current) WHERE is_current = TRUE;

-- ============================================================
--  12. DOCUMENT DOWNLOADS & EMAIL FORWARDS
-- ============================================================

CREATE TABLE document_downloads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trucker_id      UUID NOT NULL REFERENCES truckers(id),
  downloaded_by   UUID NOT NULL REFERENCES users(id),
  user_role       user_role NOT NULL,
  reason          TEXT NOT NULL,       -- mandatory reason entered by user
  ip_address      INET,
  downloaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_downloads_trucker    ON document_downloads(trucker_id);
CREATE INDEX idx_downloads_user       ON document_downloads(downloaded_by);
CREATE INDEX idx_downloads_at         ON document_downloads(downloaded_at);

CREATE TABLE document_email_forwards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trucker_id      UUID NOT NULL REFERENCES truckers(id),
  forwarded_by    UUID NOT NULL REFERENCES users(id),
  recipient_email CITEXT NOT NULL,
  shipper_id      UUID REFERENCES shippers(id),   -- NULL if ad-hoc email; set if selected from shipper contacts
  reason          TEXT NOT NULL,
  link_token      TEXT UNIQUE NOT NULL,  -- signed token for expiring link
  expires_at      TIMESTAMPTZ NOT NULL,  -- 48h for sales/dispatch, 72h for admin
  opened_at       TIMESTAMPTZ,
  opened_ip       INET,
  forwarded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_forwards_trucker ON document_email_forwards(trucker_id);
CREATE INDEX idx_email_forwards_token   ON document_email_forwards(link_token);

-- ============================================================
--  13. SALES AGENT COMMISSION THRESHOLD  (per trucker-agent pair)
-- ============================================================

CREATE TABLE agent_commission_thresholds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trucker_id          UUID NOT NULL REFERENCES truckers(id) ON DELETE CASCADE,
  agent_employee_id   UUID NOT NULL REFERENCES employees(id),
  threshold_loads     INTEGER NOT NULL,     -- max eligible loads (from global default or override)
  loads_used          INTEGER NOT NULL DEFAULT 0,
  is_global_default   BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSE = per-trucker override
  eligibility_status  agent_eligibility_status NOT NULL DEFAULT 'eligible',
  closed_reason       TEXT,                -- populated when status != eligible
  closed_at           TIMESTAMPTZ,
  set_by              UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trucker_id, agent_employee_id)
);

CREATE INDEX idx_threshold_trucker ON agent_commission_thresholds(trucker_id);
CREATE INDEX idx_threshold_agent   ON agent_commission_thresholds(agent_employee_id);
CREATE INDEX idx_threshold_status  ON agent_commission_thresholds(eligibility_status);

-- ============================================================
--  14. LOAD / ORDER RECORDS
-- ============================================================

CREATE TABLE load_orders (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number            TEXT UNIQUE NOT NULL,   -- e.g. ORD-0041, auto-generated

  trucker_id              UUID NOT NULL REFERENCES truckers(id),
  load_origin             TEXT,
  load_destination        TEXT,
  gross_load_amount_cents INTEGER NOT NULL,        -- USD cents. All load/commission math in USD.

  -- Company commission (pulled from trucker.company_commission_pct at time of load)
  company_commission_pct  NUMERIC(5,4) NOT NULL,
  company_gross_cents     INTEGER GENERATED ALWAYS AS
    (ROUND(gross_load_amount_cents * company_commission_pct)) STORED,

  -- Sales Agent
  sales_agent_id          UUID REFERENCES employees(id),
  agent_commission_pct    NUMERIC(6,4),           -- snapshot at time of load
  agent_commission_cents  INTEGER,                -- calculated: company_gross * agent_pct
  agent_eligibility       agent_eligibility_status NOT NULL DEFAULT 'not_applicable',
  agent_threshold_load_num INTEGER,               -- e.g. "this is load 2 of 3"

  -- Dispatcher
  dispatcher_id           UUID NOT NULL REFERENCES employees(id),
  dispatcher_commission_pct NUMERIC(6,4) NOT NULL,
  dispatcher_commission_cents INTEGER,            -- calculated: company_gross * dispatcher_pct

  -- Company net: company_gross - agent_comm - dispatcher_comm
  company_net_cents       INTEGER,               -- calculated at app layer, stored for reporting

  -- Status
  load_status             load_status NOT NULL DEFAULT 'pending',
  payment_received_date   DATE,
  payment_received_by     UUID REFERENCES users(id),

  -- Commission exclusion
  exclude_from_commission BOOLEAN NOT NULL DEFAULT FALSE,
  exclusion_reason        TEXT,
  excluded_by             UUID REFERENCES users(id),
  excluded_at             TIMESTAMPTZ,

  shipper_id              UUID REFERENCES shippers(id),  -- Optional. Broker/shipper who provided this load.
  shipper_email_override  CITEXT,                         -- If entered ad-hoc instead of selecting a saved shipper
  notes                   TEXT,
  created_by              UUID NOT NULL REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE order_seq START 1;
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.order_number := 'ORD-' || LPAD(NEXTVAL('order_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_number
  BEFORE INSERT ON load_orders
  FOR EACH ROW
  WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
  EXECUTE FUNCTION generate_order_number();

CREATE INDEX idx_orders_trucker      ON load_orders(trucker_id);
CREATE INDEX idx_orders_agent        ON load_orders(sales_agent_id);
CREATE INDEX idx_orders_dispatcher   ON load_orders(dispatcher_id);
CREATE INDEX idx_orders_status       ON load_orders(load_status);
CREATE INDEX idx_orders_payment_date ON load_orders(payment_received_date);
CREATE INDEX idx_orders_shipper      ON load_orders(shipper_id);

-- ============================================================
--  15. COMMISSIONS  (one row per agent/dispatcher per load)
-- ============================================================

CREATE TABLE commissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_order_id     UUID NOT NULL REFERENCES load_orders(id) ON DELETE CASCADE,
  employee_id       UUID NOT NULL REFERENCES employees(id),
  employee_type     employee_type NOT NULL,   -- 'sales_agent' or 'dispatcher'
  amount_cents          INTEGER NOT NULL,           -- USD cents
  usd_pkr_rate_at_payment   NUMERIC(12,4),           -- live USD/PKR rate fetched when Payment Received. NULL until then. Immutable after set.
  amount_pkr_paisa          INTEGER,                 -- COMPUTED by app: amount_cents × usd_pkr_rate. Stored for reporting.
  status            commission_status NOT NULL DEFAULT 'pending',
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  paid_by           UUID REFERENCES users(id),
  paid_at           TIMESTAMPTZ,
  excluded          BOOLEAN NOT NULL DEFAULT FALSE,
  exclusion_reason  TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (load_order_id, employee_id)
);

CREATE INDEX idx_commissions_employee ON commissions(employee_id);
CREATE INDEX idx_commissions_status   ON commissions(status);
CREATE INDEX idx_commissions_order    ON commissions(load_order_id);

-- ============================================================
--  16. HR DOCUMENTS  (employee HR files — separate from trucker docs)
-- ============================================================

CREATE TABLE hr_document_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

INSERT INTO hr_document_types (slug, label, sort_order) VALUES
  ('offer_letter',           'Offer Letter',                  1),
  ('employment_contract',    'Employment Contract',           2),
  ('nda',                    'NDA',                           3),
  ('id_copy',                'ID Copy',                       4),
  ('work_permit',            'Work Permit / Visa Copy',       5),
  ('pip',                    'Performance Improvement Plan',  6),
  ('termination_letter',     'Termination Letter',            7),
  ('other',                  'Other Document',                8);

CREATE TABLE hr_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  document_type_id  UUID NOT NULL REFERENCES hr_document_types(id),
  file_name         TEXT NOT NULL,
  file_path         TEXT NOT NULL,   -- S3/R2 object key
  file_size_bytes   INTEGER,
  mime_type         TEXT,
  uploaded_by       UUID NOT NULL REFERENCES users(id),
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hr_docs_employee ON hr_documents(employee_id);


-- ============================================================
--  16b. SHIPPERS  (reusable broker/freight contacts)
-- ============================================================

CREATE TABLE shippers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name    TEXT NOT NULL,
  contact_name    TEXT,
  email           CITEXT NOT NULL,
  phone           TEXT,
  source          TEXT NOT NULL DEFAULT 'dat_load_board',
                  -- 'dat_load_board' | 'direct' | 'referral' | 'other'
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shippers_email   ON shippers(email);
CREATE INDEX idx_shippers_company ON shippers(company_name);

-- ============================================================
--  17. SYSTEM SETTINGS  (key-value, admin-managed)
-- ============================================================

CREATE TABLE system_settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL,
  description   TEXT,
  updated_by    UUID REFERENCES users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed defaults
INSERT INTO system_settings (key, value, description) VALUES
  ('agent_commission_threshold_default', '1',   'Default number of commission-eligible loads for Sales Agents per trucker'),
  ('admin_download_rate_limit',          '0',   '0 = no limit'),
  ('supervisor_download_rate_limit',     '10',  'Max downloads per 24 hours'),
  ('agent_download_rate_limit',          '3',   'Max downloads per 24 hours'),
  ('dispatcher_download_rate_limit',     '3',   'Max downloads per 24 hours'),
  ('admin_email_link_expiry_hours',      '72',  'Hours before forwarded email link expires for Admin'),
  ('other_email_link_expiry_hours',      '48',  'Hours before forwarded email link expires for non-Admin'),
  ('exchange_rate_api_provider',          'exchangerate-api', 'Exchange rate API provider for USD/PKR rate fetching'),
  ('exchange_rate_api_key',               '',     'API key for exchange rate provider'),
  ('exchange_rate_manual_fallback',       '280.00', 'Fallback USD/PKR rate used when API is unavailable (Admin updates manually)');


-- ============================================================
--  20b. EMAILS  (internal communications — outbound + future inbound)
-- ============================================================
-- All outbound emails sent from TruckFlow are stored here.
-- thread_id and reply_to_address are set on every outbound email
-- so that when inbound parsing is added in a future phase,
-- replies from shippers match automatically without any schema changes.

CREATE TYPE email_direction AS ENUM ('outbound', 'inbound');
CREATE TYPE email_status AS ENUM ('queued', 'sent', 'delivered', 'failed', 'received');

CREATE TABLE emails (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id           UUID NOT NULL DEFAULT gen_random_uuid(),
                      -- Groups related emails. New thread per new conversation.
                      -- Replies share the same thread_id, matched via reply_to_address.
  direction           email_direction NOT NULL DEFAULT 'outbound',
  status              email_status NOT NULL DEFAULT 'queued',

  -- Sender
  sent_by_user_id     UUID REFERENCES users(id),     -- NULL for inbound
  sent_from_address   TEXT,                           -- e.g. dispatch@truckflowcrm.com

  -- Recipient
  recipient_email     CITEXT NOT NULL,
  shipper_id          UUID REFERENCES shippers(id),  -- NULL if ad-hoc recipient

  -- Content
  subject             TEXT NOT NULL,
  body_html           TEXT,
  body_text           TEXT,

  -- Reply-to address encodes thread_id for future inbound matching
  -- Format: thread-{thread_id}@inbound.truckflowcrm.com
  reply_to_address    TEXT,

  -- Context links
  load_order_id       UUID REFERENCES load_orders(id),
  trucker_id          UUID REFERENCES truckers(id),

  -- Delivery tracking
  provider_message_id TEXT,      -- SendGrid/SES message ID for delivery tracking
  delivered_at        TIMESTAMPTZ,
  opened_at           TIMESTAMPTZ,
  failed_reason       TEXT,

  -- Inbound (future phase — NULL for all outbound emails)
  received_at         TIMESTAMPTZ,
  in_reply_to         TEXT,      -- original email Message-ID header for threading

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_emails_thread      ON emails(thread_id);
CREATE INDEX idx_emails_sent_by     ON emails(sent_by_user_id);
CREATE INDEX idx_emails_shipper     ON emails(shipper_id);
CREATE INDEX idx_emails_load        ON emails(load_order_id);
CREATE INDEX idx_emails_trucker     ON emails(trucker_id);
CREATE INDEX idx_emails_direction   ON emails(direction);
CREATE INDEX idx_emails_created     ON emails(created_at);

-- Email attachments (documents forwarded via email)
CREATE TABLE email_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id        UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  file_path       TEXT NOT NULL,     -- S3/R2 object key
  file_size_bytes INTEGER,
  mime_type       TEXT,
  signed_url_token TEXT,             -- expiring link token (same system as document_email_forwards)
  signed_url_expires_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_attachments_email ON email_attachments(email_id);


-- ============================================================
--  20c. TEAM CHAT
-- ============================================================
-- Real-time internal messaging. WebSocket server reads/writes here.
-- No external parties — active TruckFlow employees only.

CREATE TYPE fmcsa_operating_status AS ENUM (
  'authorized_for_property',
  'authorized_for_passenger',
  'authorized_for_hm',
  'not_authorized',
  'out_of_service',
  'inactive',
  'active',
  'other'
);

CREATE TYPE fmcsa_entity_type AS ENUM (
  'corporation',
  'llc',
  'sole_proprietor',
  'partnership',
  'other'
);

CREATE TYPE fmcsa_operation_class AS ENUM (
  'for_hire_carrier',
  'private_carrier',
  'migrant',
  'exempt_for_hire',
  'private_passenger',
  'other'
);

CREATE TYPE conversation_type AS ENUM (
  'direct',        -- 1-on-1 DM between two employees
  'group',         -- named group with multiple members
  'announcement'   -- broadcast only; Admin/Supervisor post, all employees receive
);

-- One row per conversation (DM or group)
CREATE TABLE chat_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            conversation_type NOT NULL,
  name            TEXT,              -- NULL for DMs, required for group/announcement
  created_by      UUID NOT NULL REFERENCES users(id),
  is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conv_type ON chat_conversations(type);

-- Members of each conversation
CREATE TABLE chat_members (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_admin          BOOLEAN NOT NULL DEFAULT FALSE,  -- group admin (can add/remove members)
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at           TIMESTAMPTZ,                     -- NULL = still a member
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX idx_chat_members_conv ON chat_members(conversation_id);
CREATE INDEX idx_chat_members_user ON chat_members(user_id);

-- Per-user read state (for unread counts)
CREATE TABLE chat_member_state (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at      TIMESTAMPTZ,    -- messages after this = unread for this user
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX idx_member_state_user ON chat_member_state(user_id);

-- Messages
CREATE TABLE chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id),
  content         TEXT,                     -- NULL if message is attachment-only
  content_tsv     TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', COALESCE(content, ''))) STORED,
                                            -- full-text search vector
  reply_to_id     UUID REFERENCES chat_messages(id),  -- threaded reply
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,      -- soft delete
  edited_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_msg_conv    ON chat_messages(conversation_id, created_at);
CREATE INDEX idx_chat_msg_sender  ON chat_messages(sender_id);
CREATE INDEX idx_chat_msg_search  ON chat_messages USING GIN(content_tsv);

-- Message attachments (files/images sent in chat)
CREATE TABLE chat_message_attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  file_path       TEXT NOT NULL,     -- S3/R2 object key
  file_size_bytes INTEGER,
  mime_type       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_attach_msg ON chat_message_attachments(message_id);

-- Message reactions
CREATE TABLE chat_message_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,         -- e.g. '👍', '✅', '🚛'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX idx_reactions_msg ON chat_message_reactions(message_id);


-- ============================================================
--  INVOICING MODULE
--  Standalone invoicing feature — Invoicely-level functionality.
--  Invoices can be linked to a load record OR fully standalone.
--  Multi-currency (any ISO 4217 code). Multi-line-item.
--  Full lifecycle: Draft → Sent → Viewed → Paid → Overdue → Cancelled.
--  Tax lines configurable per invoice or per line item.
-- ============================================================

CREATE TYPE invoice_status AS ENUM (
  'draft',
  'sent',
  'viewed',
  'paid',
  'overdue',
  'cancelled'
);

CREATE TYPE invoice_trigger AS ENUM (
  'manual',           -- Created manually by Admin/Supervisor
  'auto_delivered'    -- Auto-created when load status → delivered
);

CREATE TYPE payment_terms AS ENUM (
  'due_on_receipt',
  'net_7',
  'net_15',
  'net_30',
  'net_60',
  'custom'            -- custom_due_days used instead
);

-- ── INVOICE CLIENTS ───────────────────────────────────────────────────────────
-- Separate from shippers. Shippers = operational contacts. Clients = billing contacts.
-- Can overlap but are managed independently.
CREATE TABLE invoice_clients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name      TEXT NOT NULL,
  contact_name      TEXT,
  email             CITEXT NOT NULL,
  billing_address   TEXT,
  city              TEXT,
  state_province    TEXT,
  postal_code       TEXT,
  country           TEXT,
  tax_id            TEXT,          -- EIN, GST number, VAT number etc.
  currency_default  CHAR(3),       -- ISO 4217 default currency for this client, e.g. USD
  notes             TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_clients_email   ON invoice_clients(email);
CREATE INDEX idx_invoice_clients_company ON invoice_clients(company_name);

-- ── INVOICE TAX RATES ─────────────────────────────────────────────────────────
-- Saved tax rate presets — Admin configures, reusable across invoices.
CREATE TABLE invoice_tax_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,        -- e.g. "GST 17%", "Sales Tax 8.5%", "WHT 5%"
  rate        NUMERIC(6,4) NOT NULL, -- e.g. 0.1700 = 17%
  description TEXT,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INVOICE BRANDING SETTINGS ─────────────────────────────────────────────────
-- One row per company (single-tenant) or per workspace (multi-tenant SaaS).
-- Stored in system_settings JSONB or dedicated table — using dedicated table for clarity.
CREATE TABLE invoice_branding (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name        TEXT NOT NULL,
  company_address     TEXT,
  company_phone       TEXT,
  company_email       CITEXT,
  company_website     TEXT,
  logo_file_path      TEXT,         -- S3/R2 object key for uploaded logo
  bank_name           TEXT,
  bank_account_number TEXT,
  bank_routing_number TEXT,
  bank_iban           TEXT,
  bank_swift          TEXT,
  invoice_footer_text TEXT,         -- e.g. "Thank you for your business"
  invoice_notes_default TEXT,       -- default notes/terms pre-filled on new invoices
  updated_by          UUID REFERENCES users(id),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INVOICES ──────────────────────────────────────────────────────────────────
CREATE TABLE invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number      TEXT UNIQUE NOT NULL,   -- INV-0001, auto-generated

  -- Source
  trigger             invoice_trigger NOT NULL DEFAULT 'manual',
  load_order_id       UUID REFERENCES load_orders(id),  -- NULL for standalone invoices

  -- Recipient
  client_id           UUID REFERENCES invoice_clients(id),  -- NULL if ad-hoc
  recipient_email     CITEXT NOT NULL,        -- pre-filled from client or entered ad-hoc
  recipient_name      TEXT,
  recipient_address   TEXT,
  recipient_tax_id    TEXT,

  -- Money
  currency            CHAR(3) NOT NULL DEFAULT 'USD',  -- ISO 4217 — any currency
  subtotal_amount     BIGINT NOT NULL DEFAULT 0,       -- sum of line item totals (smallest unit)
  tax_total_amount    BIGINT NOT NULL DEFAULT 0,       -- sum of all tax lines
  discount_amount     BIGINT NOT NULL DEFAULT 0,       -- optional invoice-level discount
  total_amount        BIGINT NOT NULL DEFAULT 0,       -- subtotal + tax - discount

  -- Dates
  invoice_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_terms       payment_terms NOT NULL DEFAULT 'net_30',
  custom_due_days     INTEGER,                -- used when payment_terms = 'custom'
  due_date            DATE NOT NULL,          -- calculated from invoice_date + terms

  -- Status lifecycle
  status              invoice_status NOT NULL DEFAULT 'draft',
  sent_at             TIMESTAMPTZ,
  viewed_at           TIMESTAMPTZ,            -- first open tracked via pixel/link
  paid_at             TIMESTAMPTZ,
  paid_by             UUID REFERENCES users(id),
  payment_reference   TEXT,                   -- e.g. wire transfer ref, cheque number
  cancelled_at        TIMESTAMPTZ,
  cancelled_by        UUID REFERENCES users(id),
  cancellation_reason TEXT,

  -- Reminders
  reminders_suppressed BOOLEAN NOT NULL DEFAULT FALSE,
  last_reminder_sent_at TIMESTAMPTZ,
  reminder_count      INTEGER NOT NULL DEFAULT 0,

  -- Content
  notes               TEXT,                   -- shown on PDF
  terms               TEXT,                   -- payment terms text shown on PDF
  internal_notes      TEXT,                   -- not shown on PDF, Admin/Supervisor only

  -- PDF
  pdf_file_path       TEXT,                   -- S3/R2 key — generated on send, regenerated on edit
  view_token          TEXT UNIQUE,            -- token for view-in-browser link (open tracking)
  view_token_expires_at TIMESTAMPTZ,

  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE invoice_seq START 1;
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.invoice_number := 'INV-' || LPAD(NEXTVAL('invoice_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW
  WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
  EXECUTE FUNCTION generate_invoice_number();

CREATE INDEX idx_invoices_client       ON invoices(client_id);
CREATE INDEX idx_invoices_load         ON invoices(load_order_id);
CREATE INDEX idx_invoices_status       ON invoices(status);
CREATE INDEX idx_invoices_due_date     ON invoices(due_date);
CREATE INDEX idx_invoices_created_by   ON invoices(created_by);
CREATE INDEX idx_invoices_view_token   ON invoices(view_token);

-- ── INVOICE LINE ITEMS ────────────────────────────────────────────────────────
CREATE TABLE invoice_line_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  description     TEXT NOT NULL,
  quantity        NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price      BIGINT NOT NULL,       -- in smallest currency unit (cents, paisa, etc.)
  line_total      BIGINT GENERATED ALWAYS AS
                  (ROUND(quantity * unit_price)) STORED,
  -- Per-line tax (optional — can also apply tax at invoice level)
  tax_rate_id     UUID REFERENCES invoice_tax_rates(id),  -- NULL = no per-line tax
  tax_rate_value  NUMERIC(6,4),          -- snapshot of rate at time of invoice creation
  tax_amount      BIGINT,                -- calculated: line_total × tax_rate_value
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_line_items_invoice ON invoice_line_items(invoice_id);

-- ── INVOICE TAX LINES ─────────────────────────────────────────────────────────
-- Invoice-level taxes applied to the subtotal (e.g. GST on total, withholding tax)
-- Separate from per-line-item taxes above.
CREATE TABLE invoice_tax_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tax_rate_id     UUID REFERENCES invoice_tax_rates(id),
  name            TEXT NOT NULL,         -- e.g. "GST 17%" — snapshot label
  rate            NUMERIC(6,4) NOT NULL, -- snapshot of rate at creation
  applies_to_amount BIGINT NOT NULL,     -- the base amount this tax applies to
  tax_amount      BIGINT NOT NULL,       -- calculated: applies_to_amount × rate
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tax_lines_invoice ON invoice_tax_lines(invoice_id);

-- ── INVOICE ACTIVITY FEED ─────────────────────────────────────────────────────
-- Immutable log of every event on an invoice — shown in the detail view.
CREATE TABLE invoice_activity (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  -- e.g. created, sent, viewed, reminder_sent, marked_paid, cancelled,
  --      line_item_added, due_date_changed, suppressed_reminders
  description     TEXT NOT NULL,
  actor_id        UUID REFERENCES users(id),   -- NULL for system events (auto reminders)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_activity_invoice ON invoice_activity(invoice_id);

-- ── INVOICE REMINDER SCHEDULE ─────────────────────────────────────────────────
-- Configurable reminder rules — stored in system_settings as JSONB or
-- as individual rows here for flexibility.
CREATE TABLE invoice_reminder_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,         -- e.g. "3 days before due"
  trigger_type      TEXT NOT NULL,         -- 'before_due' | 'on_due' | 'after_due'
  days_offset       INTEGER NOT NULL,      -- e.g. 3 = 3 days before/after
  email_subject     TEXT NOT NULL,
  email_body        TEXT NOT NULL,         -- template with {{invoice_number}}, {{amount}}, {{due_date}} etc.
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default reminder rules
-- (populated by app on first run, not SQL INSERT to allow i18n)

-- ============================================================
--  18. NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    UUID NOT NULL REFERENCES users(id),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  channel         notification_channel NOT NULL DEFAULT 'in_app',
  entity_type     TEXT,       -- 'trucker' | 'employee' | 'load_order' | 'commission' etc.
  entity_id       UUID,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, is_read);
CREATE INDEX idx_notifications_created   ON notifications(created_at);

-- ============================================================
--  19. AUDIT LOG  (immutable — no UPDATE or DELETE allowed)
-- ============================================================

CREATE TABLE audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),      -- NULL for system events
  user_role       user_role,
  action          audit_action NOT NULL,
  entity_type     TEXT NOT NULL,                  -- table name or resource label
  entity_id       UUID,
  description     TEXT NOT NULL,
  field_changed   TEXT,                           -- for update events
  old_value       TEXT,                           -- serialized; never used for bank values
  new_value       TEXT,                           -- serialized; never used for bank values
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NOTE: no updated_at, no primary key mutation — this table is append-only
);

-- Prevent UPDATE and DELETE on audit_log
CREATE RULE no_update_audit AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE no_delete_audit AS ON DELETE TO audit_log DO INSTEAD NOTHING;

CREATE INDEX idx_audit_user        ON audit_log(user_id);
CREATE INDEX idx_audit_entity      ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_action      ON audit_log(action);
CREATE INDEX idx_audit_created     ON audit_log(created_at);

-- ============================================================
--  USEFUL VIEWS
-- ============================================================

-- Active employees with their CRM user info
CREATE VIEW v_active_employees AS
  SELECT
    e.*,
    u.email       AS crm_email,
    u.role        AS crm_role,
    u.last_login_at
  FROM employees e
  LEFT JOIN users u ON u.id = e.crm_user_id
  WHERE e.employment_status = 'active';

-- Current month commission summary per employee
CREATE VIEW v_commission_summary AS
  SELECT
    c.employee_id,
    e.full_name,
    e.employee_type,
    DATE_TRUNC('month', lo.payment_received_date) AS month,
    COUNT(c.id)                                    AS load_count,
    SUM(c.amount_cents)                            AS total_usd_cents,
    SUM(c.amount_pkr_paisa)                        AS total_pkr_paisa,
    c.status
  FROM commissions c
  JOIN employees e   ON e.id = c.employee_id
  JOIN load_orders lo ON lo.id = c.load_order_id
  WHERE c.excluded = FALSE
  GROUP BY c.employee_id, e.full_name, e.employee_type,
           DATE_TRUNC('month', lo.payment_received_date), c.status;

-- Trucker onboarding progress
CREATE VIEW v_onboarding_progress AS
  SELECT
    t.id,
    t.mc_number,
    t.legal_name,
    COUNT(td.id) FILTER (WHERE td.is_current = TRUE) AS docs_uploaded,
    (SELECT COUNT(*) FROM trucker_document_types WHERE is_required = TRUE) AS docs_required,
    t.fully_onboarded_at IS NOT NULL AS is_fully_onboarded
  FROM truckers t
  LEFT JOIN trucker_documents td ON td.trucker_id = t.id
  WHERE t.status_system = 'onboarded' OR t.status_custom_id IS NOT NULL
  GROUP BY t.id;

-- ============================================================
--  END OF SCHEMA
-- ============================================================
