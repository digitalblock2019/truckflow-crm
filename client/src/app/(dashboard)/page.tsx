"use client";

import Topbar from "@/components/layout/Topbar";
import Card, { CardHeader } from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import { useState } from "react";
import { useDashboard, useTruckerActivity } from "@/lib/hooks";
import { initials, employeeTypeLabel } from "@/lib/utils";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";

type Period = "day" | "week" | "month";

function todayIso() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function stepDate(period: Period, date: string, delta: number): string {
  const d = new Date(date + "T00:00:00Z");
  if (period === "day") d.setUTCDate(d.getUTCDate() + delta);
  else if (period === "week") d.setUTCDate(d.getUTCDate() + 7 * delta);
  else d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}

function periodLabel(period: Period, date: string): string {
  const d = new Date(date + "T00:00:00Z");
  if (period === "day") {
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  if (period === "month") {
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  // week — start (Monday) of the ISO week
  const day = d.getUTCDay() || 7;
  const monday = new Date(d);
  monday.setUTCDate(monday.getUTCDate() - (day - 1));
  return `Week of ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
}

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
  const [period, setPeriod] = useState<Period>("day");
  const [date, setDate] = useState<string>(todayIso);
  const { data: activity } = useTruckerActivity(period, date);

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
          <StatCard
            label="Total Loads"
            value={loads.total}
            tooltip="Every load ever created across every status — Pending, Dispatched, In Transit, Delivered, and Payment Received. Cancelled loads excluded."
          />
          {revenue && (
            <StatCard
              label="Net Revenue"
              value={fmt(revenue.total_net_cents)}
              delta={`${fmt(revenue.this_month_gross_cents)} gross this month`}
              tooltip="What the company keeps across all loads: company commission minus the sales-agent and dispatcher payouts on each load. The line below shows gross loads booked this calendar month."
            />
          )}
          <StatCard
            label="Active Truckers"
            value={truckers.total}
            tooltip="Total truckers in the system — both in the onboarding funnel and fully onboarded. Doesn't filter out inactive or stale records."
          />
          <StatCard
            label="Outstanding Invoices"
            value={fmt(invoices.total_outstanding_cents)}
            tooltip="Total amount on invoices currently Sent or Overdue — money the company is waiting to collect."
          />
        </div>

        {/* Trucker Activity — selectable period, auto-refreshes every 30s */}
        <Card>
          <CardHeader
            title="Trucker Activity"
            subtitle={periodLabel(period, date)}
            tooltip="Counts the trucker status changes you (and, for admins, each rep) recorded in the selected period. Calls = status flipped to 'called'. SMS = 'sms_sent'. Interested = 'interested'. The big number is the total of all trucker touches, not just outreach. Use the controls above to jump to any day, week, or month."
          />
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              options={[
                { value: "day", label: "Day" },
                { value: "week", label: "Week" },
                { value: "month", label: "Month" },
              ]}
            />
            <Button size="sm" variant="secondary" onClick={() => setDate(stepDate(period, date, -1))}>&lsaquo;</Button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-2.5 py-1 border border-border rounded text-xs"
            />
            <Button size="sm" variant="secondary" onClick={() => setDate(stepDate(period, date, 1))}>&rsaquo;</Button>
            <Button size="sm" variant="secondary" onClick={() => setDate(todayIso())}>Today</Button>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-navy font-mono">{activity?.me?.total ?? 0}</span>
            <span className="text-xs text-txt-light">trucker touches by you</span>
          </div>
          <div className="text-[11px] text-txt-light mt-1 font-mono">
            {activity?.me?.calls ?? 0} calls · {activity?.me?.sms ?? 0} SMS · {activity?.me?.interested ?? 0} interested
          </div>
          {activity?.team && activity.team.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border">
              <div className="text-[10px] font-mono text-txt-light uppercase tracking-wide mb-3">Team Activity</div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {activity.team.map((t) => (
                  <div key={t.user_id} className="border border-border rounded-md p-3 bg-white">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-full bg-blue text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                        {initials(t.full_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-txt truncate">{t.full_name}</div>
                        <div className="text-[10px] font-mono text-txt-light uppercase truncate">{employeeTypeLabel(t.role)}</div>
                      </div>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-bold text-navy font-mono">{t.total}</span>
                      <span className="text-[10px] text-txt-light">touches</span>
                    </div>
                    <div className="text-[10px] text-txt-light mt-0.5 font-mono">
                      {t.calls} calls · {t.sms} SMS · {t.interested} interested
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Row 2: Load Status + Commissions */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader
              title="Load Status Breakdown"
              subtitle={`${loads.total} total loads`}
              tooltip="How many loads sit at each step of the delivery pipeline. Pending → Dispatched → In Transit → Delivered → Payment Received."
            />
            <div className="divide-y divide-border">
              <StatusRow label="Pending" count={loads.pending} color="bg-yellow-400" />
              <StatusRow label="Dispatched" count={loads.dispatched} color="bg-blue-400" />
              <StatusRow label="In Transit" count={loads.in_transit} color="bg-indigo-400" />
              <StatusRow label="Delivered" count={loads.delivered} color="bg-green-400" />
              <StatusRow label="Payment Received" count={loads.payment_received} color="bg-emerald-500" />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Commission Summary"
              subtitle="All-time totals"
              tooltip="Sales-agent and dispatcher commissions across every load, by approval state. Pending = booked but not yet approved by admin. Approved = ready to pay out. Paid = the rep has been paid. Admins see the whole company; everyone else sees only their own."
            />
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
            <CardHeader
              title="Invoice Overview"
              subtitle={`${invoices.total} total invoices`}
              tooltip="Where every invoice sits in its lifecycle. Draft = saved but not sent. Sent = emailed to the recipient. Overdue = past the due date and not paid. Paid = settled."
            />
            <div className="divide-y divide-border">
              <StatusRow label="Draft" count={invoices.draft} color="bg-gray-400" />
              <StatusRow label="Sent" count={invoices.sent} color="bg-blue-400" />
              <StatusRow label="Overdue" count={invoices.overdue} color="bg-red-400" />
              <StatusRow label="Paid" count={invoices.paid} color="bg-green-400" />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Trucker Pipeline"
              subtitle={`${truckers.total} total truckers`}
              tooltip="Onboarding = trucker has a status set and isn't fully onboarded yet (anywhere in the funnel from Called through Onboarded). Fully Onboarded = all required documents on file. Active Employees is your team headcount."
            />
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
