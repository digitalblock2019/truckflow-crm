"use client";

import Topbar from "@/components/layout/Topbar";
import Card, { CardHeader } from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import { useDashboard, useTruckerActivityToday } from "@/lib/hooks";

function fmt(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-[13px] text-txt">{label}</span>
      </div>
      <span className="text-[13px] font-mono font-semibold text-navy">{count}</span>
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useDashboard();
  const { data: activity } = useTruckerActivityToday();

  if (isLoading || !data) {
    return (
      <>
        <Topbar title="Dashboard" subtitle="Overview of your operations" />
        <div className="flex-1 flex items-center justify-center bg-surface">
          <div className="text-sm text-txt-light">Loading dashboard...</div>
        </div>
      </>
    );
  }

  const { loads, revenue, commissions, invoices, truckers, employees } = data;

  return (
    <>
      <Topbar title="Dashboard" subtitle="Overview of your operations" />
      <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-surface space-y-4">
        {/* Row 1: Key Stats. Net Revenue is company-wide — only privileged
            users get a non-null `revenue` from the API. */}
        <div className={`grid ${revenue ? "grid-cols-4" : "grid-cols-3"} gap-4`}>
          <StatCard label="Total Loads" value={loads.total} />
          {revenue && (
            <StatCard label="Net Revenue" value={fmt(revenue.total_net_cents)} delta={`${fmt(revenue.this_month_gross_cents)} gross this month`} />
          )}
          <StatCard label="Active Truckers" value={truckers.total} />
          <StatCard label="Outstanding Invoices" value={fmt(invoices.total_outstanding_cents)} />
        </div>

        {/* Today's Activity — auto-refreshes every 30s */}
        <Card>
          <CardHeader title="Today's Activity" subtitle="Trucker updates by you and your team" />
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-navy font-mono">{activity?.my_today ?? 0}</span>
            <span className="text-xs text-txt-light">trucker updates by you today</span>
          </div>
          {activity?.team && activity.team.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border">
              <div className="text-[10px] font-mono text-txt-light uppercase tracking-wide mb-2">Team Activity</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] font-mono text-txt-light uppercase">
                    <th className="text-left py-1 font-medium">User</th>
                    <th className="text-right py-1 font-medium w-20">Today</th>
                    <th className="text-right py-1 font-medium w-20">Last 7 days</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.team.map((t) => (
                    <tr key={t.user_id} className="border-t border-border/50">
                      <td className="py-1.5 text-txt">{t.full_name}</td>
                      <td className="py-1.5 text-right font-mono font-semibold text-navy">{t.today}</td>
                      <td className="py-1.5 text-right font-mono text-txt-light">{t.last_7_days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Row 2: Load Status + Commissions */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader title="Load Status Breakdown" subtitle={`${loads.total} total loads`} />
            <div className="divide-y divide-border">
              <StatusRow label="Pending" count={loads.pending} color="bg-yellow-400" />
              <StatusRow label="Dispatched" count={loads.dispatched} color="bg-blue-400" />
              <StatusRow label="In Transit" count={loads.in_transit} color="bg-indigo-400" />
              <StatusRow label="Delivered" count={loads.delivered} color="bg-green-400" />
              <StatusRow label="Payment Received" count={loads.payment_received} color="bg-emerald-500" />
            </div>
          </Card>

          <Card>
            <CardHeader title="Commission Summary" subtitle="All-time totals" />
            <div className="divide-y divide-border">
              <StatusRow label="Pending" count={Number((commissions.total_pending_cents / 100).toFixed(0))} color="bg-yellow-400" />
              <StatusRow label="Approved" count={Number((commissions.total_approved_cents / 100).toFixed(0))} color="bg-blue-400" />
              <StatusRow label="Paid" count={Number((commissions.total_paid_cents / 100).toFixed(0))} color="bg-green-400" />
            </div>
            <div className="mt-3 pt-3 border-t border-border flex justify-between text-[13px]">
              <span className="text-txt-light">Total Pending</span>
              <span className="font-mono font-semibold text-navy">{fmt(commissions.total_pending_cents)}</span>
            </div>
            <div className="flex justify-between text-[13px] mt-1">
              <span className="text-txt-light">Total Paid</span>
              <span className="font-mono font-semibold text-navy">{fmt(commissions.total_paid_cents)}</span>
            </div>
          </Card>
        </div>

        {/* Row 3: Invoices + Truckers + Employees */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader title="Invoice Overview" subtitle={`${invoices.total} total invoices`} />
            <div className="divide-y divide-border">
              <StatusRow label="Draft" count={invoices.draft} color="bg-gray-400" />
              <StatusRow label="Sent" count={invoices.sent} color="bg-blue-400" />
              <StatusRow label="Overdue" count={invoices.overdue} color="bg-red-400" />
              <StatusRow label="Paid" count={invoices.paid} color="bg-green-400" />
            </div>
          </Card>

          <Card>
            <CardHeader title="Trucker Pipeline" subtitle={`${truckers.total} total truckers`} />
            <div className="divide-y divide-border">
              <StatusRow label="Onboarding" count={truckers.onboarding} color="bg-yellow-400" />
              <StatusRow label="Fully Onboarded" count={truckers.fully_onboarded} color="bg-green-400" />
            </div>
            <div className="mt-3 pt-3 border-t border-border flex justify-between text-[13px]">
              <span className="text-txt-light">Active Employees</span>
              <span className="font-mono font-semibold text-navy">{employees.total_active}</span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
