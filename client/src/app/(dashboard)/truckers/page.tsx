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
import { useTruckers, useCreateTrucker, useUpdateTrucker, useDeleteTrucker, useBulkDeleteTruckers, useInitiateOnboarding, useEmployees, useTruckerDocuments, useUploadDocument } from "@/lib/hooks";
import { useAuthStore } from "@/lib/auth";
import { totalPages, employeeTypeLabel } from "@/lib/utils";
import ProgressBar from "@/components/ui/ProgressBar";
import DocSlot from "@/components/features/DocSlot";
import type { Trucker } from "@/types";

const statusColors: Record<string, "green" | "blue" | "orange" | "red" | "gray" | "purple"> = {
  active: "green",
  fully_onboarded: "green",
  onboarding: "blue",
  onboarding_initiated: "blue",
  onboarded: "blue",
  new_lead: "purple",
  new: "purple",
  imported: "blue",
  called: "orange",
  sms_sent: "orange",
  contacted: "orange",
  response_picked_up: "green",
  response_no_answer: "orange",
  response_not_in_use: "red",
  interested: "green",
  not_interested: "red",
  inactive: "gray",
  blacklisted: "red",
};

const allStatuses = [
  { value: "imported", label: "Imported" },
  { value: "called", label: "Called" },
  { value: "sms_sent", label: "SMS Sent" },
  { value: "response_picked_up", label: "Response - Picked Up" },
  { value: "response_no_answer", label: "Response - No Answer" },
  { value: "response_not_in_use", label: "Response - Not In Use" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not Interested" },
  { value: "onboarded", label: "Onboarded" },
];

const tabs = [
  { key: "", label: "All" },
  { key: "imported", label: "Imported" },
  { key: "called", label: "Called" },
  { key: "interested", label: "Interested" },
  { key: "onboarded", label: "Onboarded" },
  { key: "not_interested", label: "Not Interested" },
];

export default function TruckersPage() {
  const searchParams = useSearchParams();
  const batchId = searchParams.get("batch") || "";
  const [tab, setTab] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTrucker, setSelectedTrucker] = useState<Trucker | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [newAgentId, setNewAgentId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalTab, setModalTab] = useState<"details" | "documents">("details");
  const isSup = useAuthStore((s) => s.isSupervisorOrAdmin());

  const queryParams: Record<string, string | number> = { status: tab, search, page, limit: 20 };
  if (batchId) queryParams.batch = batchId;
  const { data, isLoading } = useTruckers(queryParams);
  // Fetch both sales agents and dispatchers for assignment
  const { data: agentsData } = useEmployees({ type: "sales_agent", status: "active", limit: 100 });
  const { data: dispatchersData } = useEmployees({ type: "dispatcher", status: "active", limit: 100 });
  const allAssignees = [
    ...(agentsData?.data ?? []).map((e) => ({ value: e.id, label: `${e.full_name} (${employeeTypeLabel(e.employee_type)})` })),
    ...(dispatchersData?.data ?? []).map((e) => ({ value: e.id, label: `${e.full_name} (${employeeTypeLabel(e.employee_type)})` })),
  ];

  const createTrucker = useCreateTrucker();
  const updateTrucker = useUpdateTrucker();
  const deleteTrucker = useDeleteTrucker();
  const bulkDelete = useBulkDeleteTruckers();
  const initiateOnboarding = useInitiateOnboarding();
  const { data: truckerDocs } = useTruckerDocuments(selectedTrucker?.id ?? "");
  const uploadDoc = useUploadDocument();

  const modalDocsArr = truckerDocs ?? [];
  const modalDocsUploaded = modalDocsArr.filter((d) => d.uploaded).length;
  const modalDocsProgress = modalDocsArr.length > 0 ? Math.round((modalDocsUploaded / modalDocsArr.length) * 100) : 0;

  const [form, setForm] = useState({ mc_number: "", legal_name: "", phone: "", email: "", state: "" });

  const rows = data?.data ?? [];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const columns: Column<Trucker>[] = [
    ...(isSup ? [{
      key: "select" as const,
      header: (
        <input
          type="checkbox"
          checked={rows.length > 0 && selectedIds.size === rows.length}
          onChange={toggleSelectAll}
          className="accent-blue"
        />
      ) as unknown as string,
      render: (r: Trucker) => (
        <input
          type="checkbox"
          checked={selectedIds.has(r.id)}
          onChange={(e) => { e.stopPropagation(); toggleSelect(r.id); }}
          onClick={(e) => e.stopPropagation()}
          className="accent-blue"
        />
      ),
    }] : []),
    { key: "mc_number", header: "MC#", render: (r) => <span className="font-mono font-semibold">{r.mc_number}</span> },
    { key: "legal_name", header: "Legal Name" },
    { key: "dba_name", header: "DBA" },
    { key: "state", header: "State" },
    { key: "status_system", header: "Status", render: (r) => <Badge color={statusColors[r.status_system ?? ""] ?? "gray"}>{(r.status_system ?? "—").replace(/_/g, " ")}</Badge> },
    { key: "phone", header: "Phone" },
    { key: "agent_name", header: "Agent" },
  ];

  const handleCreate = () => {
    createTrucker.mutate(form as unknown as Partial<Trucker>, {
      onSuccess: () => {
        setShowCreate(false);
        setForm({ mc_number: "", legal_name: "", phone: "", email: "", state: "" });
      },
    });
  };

  const handleStatusChange = () => {
    if (!selectedTrucker || !newStatus) return;
    updateTrucker.mutate(
      { id: selectedTrucker.id, status_system: newStatus } as Partial<Trucker> & { id: string },
      { onSuccess: () => { setSelectedTrucker(null); setNewStatus(""); } }
    );
  };

  const handleAssignAgent = () => {
    if (!selectedTrucker) return;
    updateTrucker.mutate(
      { id: selectedTrucker.id, assigned_agent_id: newAgentId || null } as Partial<Trucker> & { id: string },
      { onSuccess: () => { setSelectedTrucker(null); setNewAgentId(""); } }
    );
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} trucker(s)? This cannot be undone.`)) return;
    bulkDelete.mutate(Array.from(selectedIds), {
      onSuccess: () => setSelectedIds(new Set()),
    });
  };

  const openDetail = (row: Record<string, unknown>) => {
    const trucker = row as unknown as Trucker;
    setSelectedTrucker(trucker);
    setNewStatus(trucker.status_system || "");
    setNewAgentId((trucker as any).assigned_agent_id || "");
    setModalTab("details");
  };

  return (
    <>
      <Topbar
        title="Truckers"
        subtitle="Manage trucker/carrier database"
        actions={
          <div className="flex gap-2">
            {isSup && selectedIds.size > 0 && (
              <Button
                variant="secondary"
                onClick={handleBulkDelete}
                disabled={bulkDelete.isPending}
                className="!text-red !border-red/30 hover:!bg-red/5"
              >
                {bulkDelete.isPending ? "Deleting..." : `Delete Selected (${selectedIds.size})`}
              </Button>
            )}
            {isSup && <Button onClick={() => setShowCreate(true)}>+ Add Trucker</Button>}
          </div>
        }
      />
      <Tabs tabs={tabs} active={tab} onChange={(k) => { setTab(k); setPage(1); setSelectedIds(new Set()); }} />
      {batchId && (
        <div className="mx-6 mt-4 px-3 py-2 bg-blue-light/10 border border-blue-light/30 rounded-md text-xs text-blue flex items-center justify-between">
          <span>Showing imported batch only</span>
          <a href="/truckers" className="underline font-semibold">View All Truckers</a>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-6 bg-surface">
        <DataGrid
          columns={columns}
          data={rows}
          loading={isLoading}
          page={page}
          totalPages={totalPages(data)}
          onPageChange={(p) => { setPage(p); setSelectedIds(new Set()); }}
          onRowClick={openDetail}
          toolbar={
            <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search MC#, name..." />
          }
        />
      </div>

      {/* Trucker Detail Modal */}
      <Modal
        open={!!selectedTrucker}
        onClose={() => { setSelectedTrucker(null); setNewStatus(""); setNewAgentId(""); setModalTab("details"); }}
        title={selectedTrucker?.legal_name || "Trucker Details"}
        width="640px"
      >
        {selectedTrucker && (
          <div>
            {/* Tab Switcher */}
            <div className="flex gap-0 border-b border-border mb-5">
              {(["details", "documents"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setModalTab(t)}
                  className={`px-4 py-2 text-xs font-semibold capitalize transition-colors cursor-pointer
                    ${modalTab === t
                      ? "text-blue border-b-2 border-blue"
                      : "text-txt-light hover:text-txt"
                    }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {modalTab === "documents" ? (
              <div>
                {modalDocsArr.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-txt-mid">{modalDocsProgress}% complete</span>
                      <span className="text-[10px] text-txt-light">({modalDocsUploaded}/{modalDocsArr.length} docs)</span>
                    </div>
                    <ProgressBar value={modalDocsProgress} className="mb-5" />
                  </>
                )}
                <div className="grid grid-cols-2 gap-2.5">
                  {modalDocsArr.map((doc) => (
                    <DocSlot
                      key={doc.type_slug}
                      doc={doc}
                      onUpload={(slug) =>
                        uploadDoc.mutate({
                          truckerId: selectedTrucker.id,
                          typeSlug: slug,
                          fileName: `${slug}_${Date.now()}.pdf`,
                        })
                      }
                    />
                  ))}
                </div>
                {modalDocsArr.length === 0 && (
                  <div className="text-xs text-txt-light py-8 text-center">
                    No document types configured
                  </div>
                )}
              </div>
            ) : (
            <div>
            <div className="grid grid-cols-2 gap-4 text-xs mb-5">
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">MC Number</div>
                <div className="mt-0.5 text-txt font-mono font-semibold">{selectedTrucker.mc_number || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">DOT Number</div>
                <div className="mt-0.5 text-txt font-mono">{selectedTrucker.dot_number || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">DBA Name</div>
                <div className="mt-0.5 text-txt">{selectedTrucker.dba_name || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">State</div>
                <div className="mt-0.5 text-txt">{selectedTrucker.state || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Phone</div>
                <div className="mt-0.5 text-txt">{selectedTrucker.phone || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Email</div>
                <div className="mt-0.5 text-txt">{selectedTrucker.email || "—"}</div>
              </div>
              <div className="col-span-2">
                <div className="text-[10px] font-mono text-txt-light uppercase">Physical Address</div>
                <div className="mt-0.5 text-txt">{selectedTrucker.physical_address || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Power Units</div>
                <div className="mt-0.5 text-txt">{selectedTrucker.power_units ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Assigned Agent</div>
                <div className="mt-0.5 text-txt">{selectedTrucker.agent_name || "—"}</div>
              </div>
            </div>

            {isSup && (
              <div className="border-t border-border pt-4 mb-4">
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Select
                      label="Assign Agent"
                      value={newAgentId}
                      onChange={(e) => setNewAgentId(e.target.value)}
                      options={[
                        { value: "", label: "Unassigned" },
                        ...allAssignees,
                      ]}
                    />
                  </div>
                  <Button
                    onClick={handleAssignAgent}
                    disabled={updateTrucker.isPending || newAgentId === ((selectedTrucker as any).assigned_agent_id || "")}
                  >
                    {updateTrucker.isPending ? "Saving..." : "Assign"}
                  </Button>
                </div>
              </div>
            )}

            <div className="border-t border-border pt-4">
              <div className="text-[10px] font-mono text-txt-light uppercase mb-2">Current Status</div>
              <div className="mb-3">
                <Badge color={statusColors[selectedTrucker.status_system ?? ""] ?? "gray"}>
                  {(selectedTrucker.status_system ?? "—").replace(/_/g, " ")}
                </Badge>
              </div>

              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Select
                    label="Change Status"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    options={allStatuses}
                  />
                </div>
                <Button
                  onClick={handleStatusChange}
                  disabled={updateTrucker.isPending || newStatus === selectedTrucker.status_system}
                >
                  {updateTrucker.isPending ? "Updating..." : "Update Status"}
                </Button>
              </div>
            </div>

            {isSup && (
              <div className="border-t border-border pt-4 mt-4">
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (confirm(`Delete ${selectedTrucker.legal_name}? This cannot be undone.`)) {
                      deleteTrucker.mutate(selectedTrucker.id, {
                        onSuccess: () => setSelectedTrucker(null),
                      });
                    }
                  }}
                  disabled={deleteTrucker.isPending}
                  className="!text-red !border-red/30 hover:!bg-red/5"
                >
                  {deleteTrucker.isPending ? "Deleting..." : "Delete Trucker"}
                </Button>
              </div>
            )}
          </div>
            )}
          </div>
        )}
      </Modal>

      {/* Create Trucker Modal */}
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
