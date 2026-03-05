"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Topbar from "@/components/layout/Topbar";
import DataGrid, { Column } from "@/components/ui/DataGrid";
import SearchBox from "@/components/ui/SearchBox";
import Tabs from "@/components/ui/Tabs";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useTruckers, useCreateTrucker, useInitiateOnboarding } from "@/lib/hooks";
import { useAuthStore } from "@/lib/auth";
import { totalPages } from "@/lib/utils";
import type { Trucker } from "@/types";

const statusColors: Record<string, "green" | "blue" | "orange" | "red" | "gray" | "purple"> = {
  active: "green",
  fully_onboarded: "green",
  onboarding: "blue",
  onboarding_initiated: "blue",
  new_lead: "purple",
  new: "purple",
  called: "orange",
  sms_sent: "orange",
  contacted: "orange",
  inactive: "gray",
  blacklisted: "red",
};

const tabs = [
  { key: "", label: "All" },
  { key: "called", label: "Called" },
  { key: "active", label: "Active" },
  { key: "onboarding_initiated", label: "Onboarding" },
  { key: "new", label: "New Leads" },
  { key: "inactive", label: "Inactive" },
];

export default function TruckersPage() {
  const searchParams = useSearchParams();
  const batchId = searchParams.get("batch") || "";
  const [tab, setTab] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const isSup = useAuthStore((s) => s.isSupervisorOrAdmin());

  const params: Record<string, string | number> = { status: tab, search, page, limit: 20 };
  if (batchId) params.batch = batchId;
  const { data, isLoading } = useTruckers(params);
  const createTrucker = useCreateTrucker();
  const initiateOnboarding = useInitiateOnboarding();

  const [form, setForm] = useState({ mc_number: "", legal_name: "", phone: "", email: "", state: "" });

  const columns: Column<Trucker>[] = [
    { key: "mc_number", header: "MC#", render: (r) => <span className="font-mono font-semibold">{r.mc_number}</span> },
    { key: "legal_name", header: "Legal Name" },
    { key: "dba_name", header: "DBA" },
    { key: "state", header: "State" },
    { key: "status_system", header: "Status", render: (r) => <Badge color={statusColors[r.status_system ?? ""] ?? "gray"}>{(r.status_system ?? "—").replace(/_/g, " ")}</Badge> },
    { key: "truck_type", header: "Type" },
    { key: "agent_name", header: "Agent" },
    ...(isSup
      ? [{
          key: "actions" as const,
          header: "Actions",
          render: (r: Trucker) =>
            r.status_system === "new" || r.status_system === "sms_sent" ? (
              <Button
                size="sm"
                variant="accent"
                onClick={(e) => {
                  e.stopPropagation();
                  initiateOnboarding.mutate(r.id);
                }}
              >
                Onboard
              </Button>
            ) : null,
        }]
      : []),
  ];

  const handleCreate = () => {
    createTrucker.mutate(form as unknown as Partial<Trucker>, {
      onSuccess: () => {
        setShowCreate(false);
        setForm({ mc_number: "", legal_name: "", phone: "", email: "", state: "" });
      },
    });
  };

  return (
    <>
      <Topbar
        title="Truckers"
        subtitle="Manage trucker/carrier database"
        actions={
          isSup ? (
            <Button onClick={() => setShowCreate(true)}>+ Add Trucker</Button>
          ) : undefined
        }
      />
      <Tabs tabs={tabs} active={tab} onChange={(k) => { setTab(k); setPage(1); }} />
      {batchId && (
        <div className="mx-6 mt-4 px-3 py-2 bg-blue-light/10 border border-blue-light/30 rounded-md text-xs text-blue flex items-center justify-between">
          <span>Showing imported batch only</span>
          <a href="/truckers" className="underline font-semibold">View All Truckers</a>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-6 bg-surface">
        <DataGrid
          columns={columns}
          data={data?.data ?? []}
          loading={isLoading}
          page={page}
          totalPages={totalPages(data)}
          onPageChange={setPage}
          toolbar={
            <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search MC#, name..." />
          }
        />
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add New Trucker">
        <div className="grid grid-cols-2 gap-4">
          <Input label="MC Number" value={form.mc_number} onChange={(e) => setForm({ ...form, mc_number: e.target.value })} required />
          <Input label="Legal Name" value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} required />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Select
            label="State"
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
            options={[{ value: "", label: "Select..." }, ...["CA", "TX", "FL", "NY", "IL", "PA", "OH", "GA", "NC", "MI"].map((s) => ({ value: s, label: s }))]}
          />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createTrucker.isPending}>
            {createTrucker.isPending ? "Creating..." : "Create Trucker"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
