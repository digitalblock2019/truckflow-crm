-- ============================================================
-- One-time migration: fix commission percentages stored as whole
-- numbers (10) instead of fractions (0.10).
--
-- Background: the People form saved commission_value as typed ("10"),
-- but the load commission math (and company_commission_pct) expect a
-- fraction (0.10). Result: commissions came out 10x too large and
-- Company Net went negative.
--
-- HOW TO RUN: paste into the Supabase SQL editor and run.
-- Run STEP 0 first and eyeball the results, then run STEP 1-3.
-- The "> 1" guard makes every step idempotent and safe to re-run:
-- a correct fraction is <= 1, so it is never touched twice.
-- ============================================================

-- ---- STEP 0: inspect before changing anything (run on its own first) ----
-- SELECT full_name, commission_type, commission_value FROM employees
--   WHERE commission_type IS NOT NULL ORDER BY commission_type;
-- SELECT order_number, load_status, company_gross_cents,
--        agent_commission_pct, dispatcher_commission_pct, company_net_cents
--   FROM load_orders ORDER BY created_at;
-- SELECT lo.order_number, c.employee_type, c.amount_cents, c.status
--   FROM commissions c JOIN load_orders lo ON lo.id = c.load_order_id;
-- If any commission row above has status = 'paid', STOP and review it
-- manually — STEP 3 deliberately skips paid rows.

BEGIN;

-- ---- STEP 1: employees — percentage rate 10 -> 0.10 ----
UPDATE employees
SET commission_value = commission_value / 100,
    updated_at = NOW()
WHERE commission_type = 'percentage'
  AND commission_value > 1;

-- ---- STEP 2: load_orders — fix per-load pct snapshots, recompute cents ----
-- company_gross_cents is a GENERATED column and is already correct.
UPDATE load_orders SET
  dispatcher_commission_pct = CASE WHEN dispatcher_commission_pct > 1
    THEN dispatcher_commission_pct / 100 ELSE dispatcher_commission_pct END,
  agent_commission_pct = CASE WHEN agent_commission_pct > 1
    THEN agent_commission_pct / 100 ELSE agent_commission_pct END,
  dispatcher_commission_cents = ROUND(company_gross_cents *
    (CASE WHEN dispatcher_commission_pct > 1
      THEN dispatcher_commission_pct / 100 ELSE dispatcher_commission_pct END)),
  agent_commission_cents = ROUND(company_gross_cents *
    (CASE WHEN agent_commission_pct > 1
      THEN agent_commission_pct / 100 ELSE COALESCE(agent_commission_pct, 0) END)),
  company_net_cents = company_gross_cents
    - ROUND(company_gross_cents * (CASE WHEN agent_commission_pct > 1
        THEN agent_commission_pct / 100 ELSE COALESCE(agent_commission_pct, 0) END))
    - ROUND(company_gross_cents * (CASE WHEN dispatcher_commission_pct > 1
        THEN dispatcher_commission_pct / 100 ELSE dispatcher_commission_pct END)),
  updated_at = NOW()
WHERE dispatcher_commission_pct > 1 OR agent_commission_pct > 1;

-- ---- STEP 3: commissions — re-sync amounts from the corrected loads ----
-- Already-'paid' rows are left untouched (real money already moved).
UPDATE commissions c SET
  amount_cents = CASE c.employee_type
    WHEN 'dispatcher'  THEN lo.dispatcher_commission_cents
    WHEN 'sales_agent' THEN lo.agent_commission_cents
    ELSE c.amount_cents END,
  amount_pkr_paisa = CASE WHEN c.usd_pkr_rate_at_payment IS NOT NULL
    THEN ROUND((CASE c.employee_type
      WHEN 'dispatcher'  THEN lo.dispatcher_commission_cents
      WHEN 'sales_agent' THEN lo.agent_commission_cents
      ELSE c.amount_cents END) * c.usd_pkr_rate_at_payment)
    ELSE c.amount_pkr_paisa END,
  updated_at = NOW()
FROM load_orders lo
WHERE lo.id = c.load_order_id
  AND c.status <> 'paid';

-- Review the row counts above. COMMIT to apply, or ROLLBACK to abort.
COMMIT;
