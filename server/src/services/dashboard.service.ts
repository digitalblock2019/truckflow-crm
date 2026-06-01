import { query } from '../config/database';

export interface DashboardStats {
  loads: {
    total: number;
    pending: number;
    dispatched: number;
    in_transit: number;
    delivered: number;
    payment_received: number;
  };
  revenue: {
    total_gross_cents: number;
    total_net_cents: number;
    this_month_gross_cents: number;
  } | null;
  commissions: {
    total_pending_cents: number;
    total_approved_cents: number;
    total_paid_cents: number;
  };
  invoices: {
    total: number;
    draft: number;
    sent: number;
    overdue: number;
    paid: number;
    total_outstanding_cents: number;
  };
  truckers: {
    total: number;
    onboarding: number;
    fully_onboarded: number;
  };
  employees: {
    total_active: number;
  };
}

export class DashboardService {
  async getStats(opts: { scoped: boolean; employeeId?: string }): Promise<DashboardStats> {
    try {
      return await this.runStats(opts);
    } catch (err: any) {
      // Don't strand the UI on a single bad column/enum reference — log loudly
      // and return zeros so the dashboard renders.
      console.error('[dashboard.getStats] query failed:', err?.message, err?.detail);
      return {
        loads: { total: 0, pending: 0, dispatched: 0, in_transit: 0, delivered: 0, payment_received: 0 },
        revenue: opts.scoped ? null : { total_gross_cents: 0, total_net_cents: 0, this_month_gross_cents: 0 },
        commissions: { total_pending_cents: 0, total_approved_cents: 0, total_paid_cents: 0 },
        invoices: { total: 0, draft: 0, sent: 0, overdue: 0, paid: 0, total_outstanding_cents: 0 },
        truckers: { total: 0, onboarding: 0, fully_onboarded: 0 },
        employees: { total_active: 0 },
      };
    }
  }

  private async runStats(opts: { scoped: boolean; employeeId?: string }): Promise<DashboardStats> {
    const { scoped, employeeId } = opts;
    // Non-privileged callers (sales agent / dispatcher) see only their own
    // commission totals and no company revenue; privileged callers get
    // company-wide figures.
    const commFilter = scoped ? 'AND employee_id = $1' : '';
    const params = scoped ? [employeeId ?? null] : [];

    const result = await query(`
      SELECT
        -- Loads (table is load_orders, status column is load_status)
        (SELECT count(*) FROM load_orders)::int AS loads_total,
        (SELECT count(*) FROM load_orders WHERE load_status = 'pending')::int AS loads_pending,
        (SELECT count(*) FROM load_orders WHERE load_status = 'dispatched')::int AS loads_dispatched,
        (SELECT count(*) FROM load_orders WHERE load_status = 'in_transit')::int AS loads_in_transit,
        (SELECT count(*) FROM load_orders WHERE load_status = 'delivered')::int AS loads_delivered,
        (SELECT count(*) FROM load_orders WHERE load_status = 'payment_received')::int AS loads_payment_received,

        -- Revenue (gross_load_amount_cents = total load amount; company_net_cents = company cut after payouts)
        COALESCE((SELECT sum(gross_load_amount_cents) FROM load_orders), 0)::bigint AS revenue_total_gross_cents,
        COALESCE((SELECT sum(company_net_cents) FROM load_orders), 0)::bigint AS revenue_total_net_cents,
        COALESCE((SELECT sum(gross_load_amount_cents) FROM load_orders WHERE created_at >= date_trunc('month', now())), 0)::bigint AS revenue_this_month_gross_cents,

        -- Commissions
        COALESCE((SELECT sum(amount_cents) FROM commissions WHERE status = 'pending' ${commFilter}), 0)::bigint AS comm_pending_cents,
        COALESCE((SELECT sum(amount_cents) FROM commissions WHERE status = 'approved' ${commFilter}), 0)::bigint AS comm_approved_cents,
        COALESCE((SELECT sum(amount_cents) FROM commissions WHERE status = 'paid' ${commFilter}), 0)::bigint AS comm_paid_cents,

        -- Invoices (amount column is total_amount)
        (SELECT count(*) FROM invoices)::int AS invoices_total,
        (SELECT count(*) FROM invoices WHERE status = 'draft')::int AS invoices_draft,
        (SELECT count(*) FROM invoices WHERE status = 'sent')::int AS invoices_sent,
        (SELECT count(*) FROM invoices WHERE status = 'overdue')::int AS invoices_overdue,
        (SELECT count(*) FROM invoices WHERE status = 'paid')::int AS invoices_paid,
        COALESCE((SELECT sum(total_amount) FROM invoices WHERE status IN ('sent', 'overdue')), 0)::bigint AS invoices_outstanding_cents,

        -- Truckers (status column is status_system; "onboarding" = any trucker
        -- that has a status set but isn't fully onboarded yet. Avoids listing
        -- intermediate enum values whose presence varies across environments.)
        (SELECT count(*) FROM truckers)::int AS truckers_total,
        (SELECT count(*) FROM truckers WHERE status_system IS NOT NULL AND status_system <> 'fully_onboarded')::int AS truckers_onboarding,
        (SELECT count(*) FROM truckers WHERE status_system = 'fully_onboarded')::int AS truckers_fully_onboarded,

        -- Employees (status column is employment_status)
        (SELECT count(*) FROM employees WHERE employment_status = 'active')::int AS employees_active
    `, params);

    const r = result.rows[0];

    return {
      loads: {
        total: r.loads_total,
        pending: r.loads_pending,
        dispatched: r.loads_dispatched,
        in_transit: r.loads_in_transit,
        delivered: r.loads_delivered,
        payment_received: r.loads_payment_received,
      },
      revenue: scoped ? null : {
        total_gross_cents: Number(r.revenue_total_gross_cents),
        total_net_cents: Number(r.revenue_total_net_cents),
        this_month_gross_cents: Number(r.revenue_this_month_gross_cents),
      },
      commissions: {
        total_pending_cents: Number(r.comm_pending_cents),
        total_approved_cents: Number(r.comm_approved_cents),
        total_paid_cents: Number(r.comm_paid_cents),
      },
      invoices: {
        total: r.invoices_total,
        draft: r.invoices_draft,
        sent: r.invoices_sent,
        overdue: r.invoices_overdue,
        paid: r.invoices_paid,
        total_outstanding_cents: Number(r.invoices_outstanding_cents),
      },
      truckers: {
        total: r.truckers_total,
        onboarding: r.truckers_onboarding,
        fully_onboarded: r.truckers_fully_onboarded,
      },
      employees: {
        total_active: r.employees_active,
      },
    };
  }
}
