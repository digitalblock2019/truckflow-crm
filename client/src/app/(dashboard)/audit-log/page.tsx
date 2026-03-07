"use client";

import { useState } from "react";
import Topbar from "@/components/layout/Topbar";
import DataGrid, { Column } from "@/components/ui/DataGrid";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Badge from "@/components/ui/Badge";
import { useAuditLog } from "@/lib/hooks";
import { totalPages } from "@/lib/utils";
import type { AuditLogEntry } from "@/types";

const actionColors: Record<string, "green" | "blue" | "orange" | "red" | "gray"> = {
  create: "green",
  update: "blue",
  delete: "red",
  login: "blue",
  view: "gray",
};

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    action: "",
    entity_type: "",
    from: "",
    to: "",
  });

  const { data, isLoading } = useAuditLog({ ...filters, page, limit: 30 });

  const columns: Column<AuditLogEntry>[] = [
    {
      key: "created_at",
      header: "Timestamp",
      render: (r) => (
        <span className="font-mono text-[11px]">
          {new Date(r.created_at).toLocaleString()}
        </span>
      ),
    },
    { key: "user_email", header: "User" },
    {
      key: "action",
      header: "Action",
      render: (r) => (
        <Badge color={actionColors[r.action] ?? "gray"}>{r.action}</Badge>
      ),
    },
    { key: "entity_type", header: "Entity Type", render: (r) => <span className="font-mono">{r.entity_type}</span> },
    { key: "entity_id", header: "Entity ID", render: (r) => <span className="font-mono text-[11px]">{r.entity_id ?? "—"}</span> },
    {
      key: "description",
      header: "Description",
      render: (r) => (
        <span className="text-[11px] text-txt-mid truncate max-w-[300px] block" title={(r as any).description ?? ""}>
          {(r as any).description ?? "—"}
        </span>
      ),
    },
  ];

  return (
    <>
      <Topbar title="Audit Log" subtitle="System activity and security log" />
      <div className="flex-1 overflow-y-auto p-6 bg-surface">
        <DataGrid
          columns={columns}
          data={(data?.data ?? [])}
          loading={isLoading}
          page={page}
          totalPages={totalPages(data)}
          onPageChange={setPage}
          toolbar={
            <div className="flex gap-2 items-end flex-wrap">
              <Select
                value={filters.action}
                onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                options={[
                  { value: "", label: "All Actions" },
                  { value: "create", label: "Create" },
                  { value: "update", label: "Update" },
                  { value: "delete", label: "Delete" },
                  { value: "login", label: "Login" },
                  { value: "view", label: "View" },
                ]}
              />
              <Select
                value={filters.entity_type}
                onChange={(e) => setFilters({ ...filters, entity_type: e.target.value })}
                options={[
                  { value: "", label: "All Entities" },
                  { value: "trucker", label: "Trucker" },
                  { value: "load", label: "Load" },
                  { value: "employee", label: "Employee" },
                  { value: "commission", label: "Commission" },
                  { value: "invoice", label: "Invoice" },
                  { value: "user", label: "User" },
                ]}
              />
              <Input
                type="date"
                value={filters.from}
                onChange={(e) => setFilters({ ...filters, from: e.target.value })}
                placeholder="From"
              />
              <Input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters({ ...filters, to: e.target.value })}
                placeholder="To"
              />
            </div>
          }
        />
      </div>
    </>
  );
}
