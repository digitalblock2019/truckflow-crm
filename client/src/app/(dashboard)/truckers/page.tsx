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
  { value: "onboarded", label: "Start Onboarding" },
  { value: "fully_onboarded", label: "Fully Onboarded" },
];

const statusLabels: Record<string, string> = {
  onboarded: "onboarding",
  fully_onboarded: "fully onboarded",
  sms_sent: "sms sent",
  response_picked_up: "picked up",
  response_no_answer: "no answer",
  response_not_in_use: "not in use",
  not_interested: "not interested",
};

const tabs = [
  { key: "", label: "All" },
  { key: "imported", label: "Imported" },
  { key: "called,sms_sent", label: "Called / SMS Sent" },
  { key: "interested", label: "Interested" },
  { key: "onboarded", label: "Ready For Onboarding" },
  { key: "fully_onboarded", label: "Fully Onboarded" },
  { key: "not_interested", label: "Not Interested" },
];

export default function TruckersPage() {
  const searchParams = useSearchParams();
  const batchId = searchParams.get("batch") || "";
  const initialTab = searchParams.get("tab") || "";
  const [tab, setTab] = useState(initialTab);
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
  const [editForm, setEditForm] = useState({ phone: "", email: "", dba_name: "", physical_address: "", dot_number: "" });

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
    { key: "status_system", header: "Status", render: (r) => <Badge color={statusColors[r.status_system ?? ""] ?? "gray"}>{statusLabels[r.status_system ?? ""] ?? (r.status_system ?? "—").replace(/_/g, " ")}</Badge> },
    { key: "email", header: "Email" },
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
    setEditForm({
      phone: trucker.phone || "",
      email: trucker.email || "",
      dba_name: trucker.dba_name || "",
      physical_address: trucker.physical_address || "",
      dot_number: trucker.dot_number || "",
    });
    setModalTab("details");
  };

  const handleSaveDetails = () => {
    if (!selectedTrucker) return;
    updateTrucker.mutate(
      { id: selectedTrucker.id, ...editForm } as Partial<Trucker> & { id: string },
      { onSuccess: () => setSelectedTrucker(null) }
    );
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
                {/* Conditional flags */}
                <div className="flex flex-wrap gap-4 mb-4 p-3 bg-surface-mid rounded-lg">
                  {([
                    { key: "uses_factoring", label: "Uses Factoring" },
                    { key: "is_new_authority", label: "New Authority" },
                    { key: "uses_quick_pay", label: "Uses Quick Pay" },
                  ] as const).map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!(selectedTrucker as any)[key]}
                        onClick={() => {
                          const newVal = !(selectedTrucker as any)[key];
                          setSelectedTrucker({ ...selectedTrucker, [key]: newVal } as Trucker);
                          updateTrucker.mutate({
                            id: selectedTrucker.id,
                            [key]: newVal,
                          } as any);
                        }}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          (selectedTrucker as any)[key] ? "bg-blue" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                            (selectedTrucker as any)[key] ? "translate-x-[18px]" : "translate-x-[3px]"
                          }`}
                        />
                      </button>
                      <span className="text-txt-mid">{label}</span>
                    </label>
                  ))}
                </div>

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
                      truckerId={selectedTrucker.id}
                      onUpload={(slug, file) =>
                        uploadDoc.mutate({
                          truckerId: selectedTrucker.id,
                          typeSlug: slug,
                          file,
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
              <Input
                label="DOT Number"
                value={editForm.dot_number}
                onChange={(e) => setEditForm({ ...editForm, dot_number: e.target.value })}
              />
              <Input
                label="DBA Name"
                value={editForm.dba_name}
                onChange={(e) => setEditForm({ ...editForm, dba_name: e.target.value })}
              />
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">State</div>
                <div className="mt-0.5 text-txt">{selectedTrucker.state || "—"}</div>
              </div>
              <Input
                label="Phone"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
              <Input
                label="Email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
              <div className="col-span-2">
                <Input
                  label="Physical Address"
                  value={editForm.physical_address}
                  onChange={(e) => setEditForm({ ...editForm, physical_address: e.target.value })}
                />
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

            {/* Save edits button */}
            {(editForm.phone !== (selectedTrucker.phone || "") ||
              editForm.email !== (selectedTrucker.email || "") ||
              editForm.dba_name !== (selectedTrucker.dba_name || "") ||
              editForm.physical_address !== (selectedTrucker.physical_address || "") ||
              editForm.dot_number !== (selectedTrucker.dot_number || "")) && (
              <div className="mb-4">
                <Button
                  onClick={handleSaveDetails}
                  disabled={updateTrucker.isPending}
                  className="w-full"
                >
                  {updateTrucker.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            )}

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
                  {statusLabels[selectedTrucker.status_system ?? ""] ?? (selectedTrucker.status_system ?? "—").replace(/_/g, " ")}
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
