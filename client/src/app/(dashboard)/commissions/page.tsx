"use client";

import { useState } from "react";
import Topbar from "@/components/layout/Topbar";
import StatCard from "@/components/ui/StatCard";
import DataGrid, { Column } from "@/components/ui/DataGrid";
import Badge from "@/components/ui/Badge";
import Tabs from "@/components/ui/Tabs";
import Button from "@/components/ui/Button";
import CommissionFormula from "@/components/features/CommissionFormula";
import { useCommissions, useCommissionSummary, useUpdateCommissionStatus } from "@/lib/hooks";
import { useAuthStore } from "@/lib/auth";
import { totalPages, fmt } from "@/lib/utils";
import type { Commission } from "@/types";

const statusColors: Record<string, "green" | "blue" | "orange" | "red" | "gray"> = {
  pending: "orange",
  approved: "blue",
  paid: "green",
  disputed: "red",
};

const tabs = [
  { key: "", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
];

export default function CommissionsPage() {
  const [tab, setTab] = useState("");
  const [page, setPage] = useState(1);
  const isSup = useAuthStore((s) => s.isSupervisorOrAdmin());
  const { data, isLoading } = useCommissions({ status: tab, page, limit: 20 });
  const { data: summary } = useCommissionSummary();
  const updateStatus = useUpdateCommissionStatus();

  // summary may be an array or object
  const summaryData = Array.isArray(summary) ? summary[0] : summary;

  const columns: Column<Commission>[] = [
    { key: "employee_name", header: "Employee" },
    { key: "employee_type", header: "Type", render: (r) => <Badge color="blue">{r.employee_type ?? "—"}</Badge> },
    { key: "order_number", header: "Order#", render: (r) => <span className="font-mono">{r.order_number ?? "—"}</span> },
    { key: "amount_cents", header: "Amount", render: (r) => <span className="font-mono font-semibold">{fmt(r.amount_cents)}</span> },
    { key: "status", header: "Status", render: (r) => <Badge color={statusColors[r.status] ?? "gray"}>{r.status}</Badge> },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleDateString() },
    ...(isSup
      ? [{
          key: "actions" as const,
          header: "Actions",
          render: (r: Commission) =>
            r.status === "pending" ? (
              <div className="flex gap-1">
                <Button size="sm" onClick={(e) => { e.stopPropagation(); updateStatus.mutate({ id: r.id, status: "approved" }); }}>
                  Approve
                </Button>
              </div>
            ) : null,
        }]
      : []),
  ];

  return (
    <>
      <Topbar title="Commissions" subtitle="Commission management dashboard" />
      <div className="flex-1 overflow-y-auto p-6 bg-surface">
        <CommissionFormula
          grossLoad="$12,500"
          carrierPay="$10,000"
          netRevenue="$2,500"
          rate="15%"
          commission="$375"
        />

        <div className="grid grid-cols-4 gap-3 mb-5">
          <StatCard label="Pending" value={fmt(summaryData?.total_pending_cents ?? 0)} />
          <StatCard label="Approved" value={fmt(summaryData?.total_approved_cents ?? 0)} />
          <StatCard label="Paid" value={fmt(summaryData?.total_paid_cents ?? 0)} />
          <StatCard label="Total" value={data?.total ?? 0} />
        </div>

        <Tabs tabs={tabs} active={tab} onChange={(k) => { setTab(k); setPage(1); }} />
        <div className="mt-4">
          <DataGrid
            columns={columns}
            data={data?.data ?? []}
            loading={isLoading}
            page={page}
            totalPages={totalPages(data)}
            onPageChange={setPage}
          />
        </div>
      </div>
    </>
  );
}
