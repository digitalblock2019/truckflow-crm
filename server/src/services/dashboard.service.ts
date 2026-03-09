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
  };
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
  async getStats(): Promise<DashboardStats> {
    const result = await query(`
      SELECT
        -- Loads
        (SELECT count(*) FROM loads)::int AS loads_total,
        (SELECT count(*) FROM loads WHERE status = 'pending')::int AS loads_pending,
        (SELECT count(*) FROM loads WHERE status = 'dispatched')::int AS loads_dispatched,
        (SELECT count(*) FROM loads WHERE status = 'in_transit')::int AS loads_in_transit,
        (SELECT count(*) FROM loads WHERE status = 'delivered')::int AS loads_delivered,
        (SELECT count(*) FROM loads WHERE status = 'payment_received')::int AS loads_payment_received,

        -- Revenue
        COALESCE((SELECT sum(gross_pay_cents) FROM loads), 0)::bigint AS revenue_total_gross_cents,
        COALESCE((SELECT sum(net_pay_cents) FROM loads), 0)::bigint AS revenue_total_net_cents,
        COALESCE((SELECT sum(gross_pay_cents) FROM loads WHERE created_at >= date_trunc('month', now())), 0)::bigint AS revenue_this_month_gross_cents,

        -- Commissions
        COALESCE((SELECT sum(amount_cents) FROM commissions WHERE status = 'pending'), 0)::bigint AS comm_pending_cents,
        COALESCE((SELECT sum(amount_cents) FROM commissions WHERE status = 'approved'), 0)::bigint AS comm_approved_cents,
        COALESCE((SELECT sum(amount_cents) FROM commissions WHERE status = 'paid'), 0)::bigint AS comm_paid_cents,

        -- Invoices
        (SELECT count(*) FROM invoices)::int AS invoices_total,
        (SELECT count(*) FROM invoices WHERE status = 'draft')::int AS invoices_draft,
        (SELECT count(*) FROM invoices WHERE status = 'sent')::int AS invoices_sent,
        (SELECT count(*) FROM invoices WHERE status = 'overdue')::int AS invoices_overdue,
        (SELECT count(*) FROM invoices WHERE status = 'paid')::int AS invoices_paid,
        COALESCE((SELECT sum(total_cents) FROM invoices WHERE status IN ('sent', 'overdue')), 0)::bigint AS invoices_outstanding_cents,

        -- Truckers
        (SELECT count(*) FROM truckers)::int AS truckers_total,
        (SELECT count(*) FROM truckers WHERE onboarding_status = 'onboarding')::int AS truckers_onboarding,
        (SELECT count(*) FROM truckers WHERE onboarding_status = 'fully_onboarded')::int AS truckers_fully_onboarded,

        -- Employees
        (SELECT count(*) FROM employees WHERE status = 'active')::int AS employees_active
    `);

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
      revenue: {
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
