"use client";

import { useState, useEffect } from "react";
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
import { useTruckers, useCreateTrucker, useUpdateTrucker, useDeleteTrucker, useBulkDeleteTruckers, useBulkAssignTruckers, useInitiateOnboarding, useEmployees, useTruckerDocuments, useUploadDocument, useMe } from "@/lib/hooks";
import { useAuthStore } from "@/lib/auth";
import { totalPages, employeeTypeLabel } from "@/lib/utils";
import ProgressBar from "@/components/ui/ProgressBar";
import DocSlot from "@/components/features/DocSlot";
import RoutesAndAvailabilityFields, {
  type RoutesValue,
  emptyRoutes,
  routesValueFromTrucker,
  routesEqual,
  serializeRoutes,
} from "@/components/features/RoutesAndAvailabilityFields";
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
  // Not manually selectable — fully_onboarded is set from the Onboarding page
  // once all required documents are uploaded (enforced server-side too).
  { value: "fully_onboarded", label: "Fully Onboarded (set on Onboarding page)", disabled: true },
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

const TRUCK_KIND_OPTIONS = [
  { value: "dry_van", label: "Dry Van" },
  { value: "reefer", label: "Reefer" },
  { value: "flatbed", label: "Flatbed" },
  { value: "step_deck", label: "Step deck" },
  { value: "power_only", label: "Power only" },
  { value: "hotshot", label: "Hotshot" },
  { value: "cargo_van", label: "Cargo Van" },
  { value: "sprinter_van", label: "Sprinter Van" },
  { value: "box_truck", label: "Box Truck" },
  { value: "tanker", label: "Tanker" },
  { value: "other", label: "Other" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
  "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];
const CA_PROVINCES = [
  "AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT",
];
const STATE_PROVINCE_OPTIONS = [
  { value: "", label: "Select..." },
  ...US_STATES.map((s) => ({ value: s, label: s })),
  { value: "__ca_sep__", label: "── Canada ──", disabled: true },
  ...CA_PROVINCES.map((p) => ({ value: p, label: p })),
];

const truckKindLabel = (value: string) =>
  TRUCK_KIND_OPTIONS.find((o) => o.value === value)?.label ?? value;

const tabs = [
  { key: "", label: "All" },
  { key: "imported", label: "Imported" },
  { key: "called,sms_sent", label: "Called / SMS Sent" },
  { key: "interested", label: "Interested" },
  { key: "onboarded", label: "Ready For Onboarding" },
  { key: "fully_onboarded", label: "Fully Onboarded" },
  { key: "not_interested", label: "Not Interested" },
  // Special tabs: use *_unassigned_* filters instead of a status enum value.
  // Handled in queryParams below — the key values are sentinels.
  { key: "__unassigned_sales_agent__", label: "Unassigned (no sales rep)" },
  { key: "__unassigned_dispatcher__", label: "Unassigned (no dispatcher)" },
];

export default function TruckersPage() {
  const searchParams = useSearchParams();
  const batchId = searchParams.get("batch") || "";
  const initialTab = searchParams.get("tab") || "";
  const [tab, setTab] = useState(initialTab);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [showCreate, setShowCreate] = useState(false);
  const [createTruckerErr, setCreateTruckerErr] = useState<string | null>(null);
  const [selectedTrucker, setSelectedTrucker] = useState<Trucker | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [newSalesAgentId, setNewSalesAgentId] = useState("");
  const [newDispatcherId, setNewDispatcherId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalTab, setModalTab] = useState<"details" | "documents">("details");
  const isSup = useAuthStore((s) => s.isSupervisorOrAdmin());

  // Current user — used to default sales reps to their own truckers.
  const { data: meData } = useMe();
  const me = meData as { id?: string; role?: string; employee_id?: string } | undefined;
  const isSelfRep = me?.role === "sales_agent" || me?.role === "sales_and_dispatcher";

  // Sales Rep filter for the list. Empty string = no filter (show all).
  // For a sales rep, defaults to their own employee_id; they can flip to "All".
  const [filterSalesAgentId, setFilterSalesAgentId] = useState<string>("");
  const [salesFilterInitialized, setSalesFilterInitialized] = useState(false);
  useEffect(() => {
    if (!salesFilterInitialized && isSelfRep && me?.employee_id) {
      setFilterSalesAgentId(me.employee_id);
      setSalesFilterInitialized(true);
    } else if (!salesFilterInitialized && me && !isSelfRep) {
      setSalesFilterInitialized(true);
    }
  }, [isSelfRep, me, salesFilterInitialized]);

  // Bulk-assign modal state.
  const [showBulkAssign, setShowBulkAssign] = useState<null | { mode: "selection" | "batch"; count: number }>(null);
  const [bulkSalesValue, setBulkSalesValue] = useState<string>("");        // "" don't change, "__unassign__" clear, uuid assign
  const [bulkDispatcherValue, setBulkDispatcherValue] = useState<string>("");

  // The Unassigned tabs use separate query filters instead of a status enum value.
  const isUnassignedDispatcherTab = tab === "__unassigned_dispatcher__";
  const isUnassignedSalesTab = tab === "__unassigned_sales_agent__";
  const isSpecialTab = isUnassignedDispatcherTab || isUnassignedSalesTab;
  const queryParams: Record<string, string | number | boolean> = {
    status: isSpecialTab ? "" : tab,
    search,
    page,
    limit: pageSize,
  };
  if (isUnassignedDispatcherTab) queryParams.unassigned_dispatcher = true;
  if (batchId) queryParams.batch = batchId;
  // Sales-agent scope: tab wins over the dropdown when the tab is active.
  if (isUnassignedSalesTab || filterSalesAgentId === "__unassigned__") {
    queryParams.unassigned_sales_agent = true;
  } else if (filterSalesAgentId) {
    queryParams.assigned_sales_agent_to = filterSalesAgentId;
  }
  const { data, isLoading } = useTruckers(queryParams);
  // Fetch sales agents, dispatchers, and dual-role users. Each role's dropdown
  // gets the appropriate union (sales_agent ∪ sales_and_dispatcher for the
  // sales slot, dispatcher ∪ sales_and_dispatcher for the dispatcher slot).
  // The /api/employees filter already unions sales_and_dispatcher into both
  // 'sales_agent' and 'dispatcher' queries, so a separate dual fetch would
  // double-list those employees in the dropdowns.
  const { data: agentsData } = useEmployees({ type: "sales_agent", status: "active", limit: 100 });
  const { data: dispatchersData } = useEmployees({ type: "dispatcher", status: "active", limit: 100 });
  const salesAgentOptions = (agentsData?.data ?? []).map((e) => ({
    value: e.id,
    label: `${e.full_name} (${employeeTypeLabel(e.employee_type)})`,
  }));
  const dispatcherOptions = (dispatchersData?.data ?? []).map((e) => ({
    value: e.id,
    label: `${e.full_name} (${employeeTypeLabel(e.employee_type)})`,
  }));
  // A trucker can be assigned to an admin/supervisor who isn't in the
  // sales-agent / dispatcher employee filters above. Without this, the
  // select can't match the stored ID and silently shows "Unassigned"
  // even though the value is set, which makes the list and modal disagree.
  if (
    selectedTrucker?.assigned_sales_agent_id &&
    !salesAgentOptions.some((o) => o.value === selectedTrucker.assigned_sales_agent_id)
  ) {
    salesAgentOptions.push({
      value: selectedTrucker.assigned_sales_agent_id,
      label: selectedTrucker.sales_agent_name || "Currently assigned",
    });
  }
  if (
    selectedTrucker?.assigned_dispatcher_id &&
    !dispatcherOptions.some((o) => o.value === selectedTrucker.assigned_dispatcher_id)
  ) {
    dispatcherOptions.push({
      value: selectedTrucker.assigned_dispatcher_id,
      label: selectedTrucker.dispatcher_name || "Currently assigned",
    });
  }

  const createTrucker = useCreateTrucker();
  const updateTrucker = useUpdateTrucker();
  const deleteTrucker = useDeleteTrucker();
  const bulkDelete = useBulkDeleteTruckers();
  const bulkAssign = useBulkAssignTruckers();
  const initiateOnboarding = useInitiateOnboarding();

  const handleOpenBulkAssign = (mode: "selection" | "batch", count: number) => {
    setBulkSalesValue("");
    setBulkDispatcherValue("");
    setShowBulkAssign({ mode, count });
  };
  const handleConfirmBulkAssign = () => {
    if (!showBulkAssign) return;
    const sales = bulkSalesValue === "" ? undefined : bulkSalesValue === "__unassign__" ? null : bulkSalesValue;
    const disp = bulkDispatcherValue === "" ? undefined : bulkDispatcherValue === "__unassign__" ? null : bulkDispatcherValue;
    if (sales === undefined && disp === undefined) return;
    const payload: { ids?: string[]; batch_id?: string; sales_agent_id?: string | null; dispatcher_id?: string | null } = {};
    if (sales !== undefined) payload.sales_agent_id = sales;
    if (disp !== undefined) payload.dispatcher_id = disp;
    if (showBulkAssign.mode === "batch" && batchId) {
      payload.batch_id = batchId;
    } else {
      payload.ids = Array.from(selectedIds);
    }
    bulkAssign.mutate(payload, {
      onSuccess: () => {
        setShowBulkAssign(null);
        setSelectedIds(new Set());
      },
    });
  };
  const { data: truckerDocs } = useTruckerDocuments(selectedTrucker?.id ?? "");
  const uploadDoc = useUploadDocument();

  const modalDocsArr = truckerDocs ?? [];
  const modalDocsUploaded = modalDocsArr.filter((d) => d.uploaded).length;
  const modalDocsProgress = modalDocsArr.length > 0 ? Math.round((modalDocsUploaded / modalDocsArr.length) * 100) : 0;

  const [form, setForm] = useState({
    mc_number: "",
    legal_name: "",
    phone: "",
    email: "",
    city: "",
    state: "",
    power_units: "",
    truck_types: [] as string[],
    truck_length_ft: "",
    truck_width_ft: "",
    truck_height_ft: "",
    max_payload_lbs: "",
    routes: emptyRoutes as RoutesValue,
  });
  const [editForm, setEditForm] = useState({
    phone: "",
    email: "",
    dba_name: "",
    physical_address: "",
    dot_number: "",
    city: "",
    power_units: "",
    truck_types: [] as string[],
    truck_length_ft: "",
    truck_width_ft: "",
    truck_height_ft: "",
    max_payload_lbs: "",
    routes: emptyRoutes as RoutesValue,
  });

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
    { key: "sales_agent_name", header: "Sales Agent", render: (r) => <span className="text-xs">{r.sales_agent_name || "—"}</span> },
    { key: "dispatcher_name", header: "Dispatcher", render: (r) => <span className="text-xs">{r.dispatcher_name || "—"}</span> },
  ];

  const handleCreate = () => {
    const payload: Record<string, unknown> = {
      mc_number: form.mc_number,
      legal_name: form.legal_name,
      phone: form.phone || null,
      email: form.email || null,
      city: form.city || null,
      state: form.state || null,
      power_units: form.power_units ? parseInt(form.power_units) || null : null,
      truck_types: form.truck_types.length ? form.truck_types : null,
      truck_length_ft: form.truck_length_ft ? parseFloat(form.truck_length_ft) || null : null,
      truck_width_ft: form.truck_width_ft ? parseFloat(form.truck_width_ft) || null : null,
      truck_height_ft: form.truck_height_ft ? parseFloat(form.truck_height_ft) || null : null,
      max_payload_lbs: form.max_payload_lbs ? parseInt(form.max_payload_lbs) || null : null,
      ...serializeRoutes(form.routes),
    };
    setCreateTruckerErr(null);
    createTrucker.mutate(payload as Partial<Trucker>, {
      onSuccess: () => {
        setShowCreate(false);
        setCreateTruckerErr(null);
        setForm({
          mc_number: "", legal_name: "", phone: "", email: "", city: "", state: "",
          power_units: "", truck_types: [], truck_length_ft: "", truck_width_ft: "",
          truck_height_ft: "", max_payload_lbs: "", routes: emptyRoutes,
        });
      },
      onError: (err) => setCreateTruckerErr(err instanceof Error ? err.message : "Could not create trucker"),
    });
  };

  const toggleTruckType = (value: string) => {
    setForm((prev) => {
      const has = prev.truck_types.includes(value);
      return { ...prev, truck_types: has ? prev.truck_types.filter((t) => t !== value) : [...prev.truck_types, value] };
    });
  };

  const [statusError, setStatusError] = useState<string | null>(null);
  const handleStatusChange = () => {
    if (!selectedTrucker || !newStatus) return;
    setStatusError(null);
    updateTrucker.mutate(
      { id: selectedTrucker.id, status_system: newStatus } as Partial<Trucker> & { id: string },
      {
        onSuccess: () => { setSelectedTrucker(null); setNewStatus(""); setStatusError(null); },
        onError: (err) => setStatusError((err as Error)?.message || "Status change failed"),
      }
    );
  };

  const handleAssignAgents = () => {
    if (!selectedTrucker) return;
    // Mirror to the legacy assigned_agent_id so back-compat readers still work
    // until PR 3 drops the column. Prefer the sales slot, fall back to dispatcher.
    const legacyMirror = newSalesAgentId || newDispatcherId || null;
    updateTrucker.mutate(
      {
        id: selectedTrucker.id,
        assigned_sales_agent_id: newSalesAgentId || null,
        assigned_dispatcher_id: newDispatcherId || null,
        assigned_agent_id: legacyMirror,
      } as Partial<Trucker> & { id: string },
      { onSuccess: () => { setSelectedTrucker(null); setNewSalesAgentId(""); setNewDispatcherId(""); } }
    );
  };

  const assignmentsDirty =
    selectedTrucker !== null &&
    (newSalesAgentId !== (selectedTrucker.assigned_sales_agent_id || "") ||
      newDispatcherId !== (selectedTrucker.assigned_dispatcher_id || ""));

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
    setNewSalesAgentId(trucker.assigned_sales_agent_id || "");
    setNewDispatcherId(trucker.assigned_dispatcher_id || "");
    setEditForm({
      phone: trucker.phone || "",
      email: trucker.email || "",
      dba_name: trucker.dba_name || "",
      physical_address: trucker.physical_address || "",
      dot_number: trucker.dot_number || "",
      city: trucker.city || "",
      power_units: trucker.power_units != null ? String(trucker.power_units) : "",
      truck_types: Array.isArray(trucker.truck_types) ? trucker.truck_types : [],
      truck_length_ft: trucker.truck_length_ft != null ? String(trucker.truck_length_ft) : "",
      truck_width_ft: trucker.truck_width_ft != null ? String(trucker.truck_width_ft) : "",
      truck_height_ft: trucker.truck_height_ft != null ? String(trucker.truck_height_ft) : "",
      max_payload_lbs: trucker.max_payload_lbs != null ? String(trucker.max_payload_lbs) : "",
      routes: routesValueFromTrucker(trucker),
    });
    setModalTab("details");
  };

  const handleSaveDetails = () => {
    if (!selectedTrucker) return;
    const payload: Record<string, unknown> = {
      id: selectedTrucker.id,
      phone: editForm.phone || null,
      email: editForm.email || null,
      dba_name: editForm.dba_name || null,
      physical_address: editForm.physical_address || null,
      dot_number: editForm.dot_number || null,
      city: editForm.city || null,
      power_units: editForm.power_units ? parseInt(editForm.power_units) || null : null,
      truck_types: editForm.truck_types.length ? editForm.truck_types : null,
      truck_length_ft: editForm.truck_length_ft ? parseFloat(editForm.truck_length_ft) || null : null,
      truck_width_ft: editForm.truck_width_ft ? parseFloat(editForm.truck_width_ft) || null : null,
      truck_height_ft: editForm.truck_height_ft ? parseFloat(editForm.truck_height_ft) || null : null,
      max_payload_lbs: editForm.max_payload_lbs ? parseInt(editForm.max_payload_lbs) || null : null,
      ...serializeRoutes(editForm.routes),
    };
    updateTrucker.mutate(
      payload as Partial<Trucker> & { id: string },
      { onSuccess: () => setSelectedTrucker(null) }
    );
  };

  const toggleEditTruckType = (value: string) => {
    setEditForm((prev) => {
      const has = prev.truck_types.includes(value);
      return { ...prev, truck_types: has ? prev.truck_types.filter((t) => t !== value) : [...prev.truck_types, value] };
    });
  };

  const detailDirty = (() => {
    if (!selectedTrucker) return false;
    const t = selectedTrucker;
    if (editForm.phone !== (t.phone || "")) return true;
    if (editForm.email !== (t.email || "")) return true;
    if (editForm.dba_name !== (t.dba_name || "")) return true;
    if (editForm.physical_address !== (t.physical_address || "")) return true;
    if (editForm.dot_number !== (t.dot_number || "")) return true;
    if (editForm.city !== (t.city || "")) return true;
    if (editForm.power_units !== (t.power_units != null ? String(t.power_units) : "")) return true;
    if (editForm.truck_length_ft !== (t.truck_length_ft != null ? String(t.truck_length_ft) : "")) return true;
    if (editForm.truck_width_ft !== (t.truck_width_ft != null ? String(t.truck_width_ft) : "")) return true;
    if (editForm.truck_height_ft !== (t.truck_height_ft != null ? String(t.truck_height_ft) : "")) return true;
    if (editForm.max_payload_lbs !== (t.max_payload_lbs != null ? String(t.max_payload_lbs) : "")) return true;
    const origTypes = Array.isArray(t.truck_types) ? t.truck_types : [];
    if (editForm.truck_types.length !== origTypes.length) return true;
    if (editForm.truck_types.some((v) => !origTypes.includes(v))) return true;
    if (!routesEqual(editForm.routes, routesValueFromTrucker(t))) return true;
    return false;
  })();

  return (
    <>
      <Topbar
        title="Truckers"
        subtitle="Manage trucker/carrier database"
        actions={
          <div className="flex gap-2">
            {isSup && selectedIds.size > 0 && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => handleOpenBulkAssign("selection", selectedIds.size)}
                >
                  Bulk Assign ({selectedIds.size})
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleBulkDelete}
                  disabled={bulkDelete.isPending}
                  className="!text-red !border-red/30 hover:!bg-red/5"
                >
                  {bulkDelete.isPending ? "Deleting..." : `Delete Selected (${selectedIds.size})`}
                </Button>
              </>
            )}
            {isSup && <Button onClick={() => setShowCreate(true)}>+ Add Trucker</Button>}
          </div>
        }
      />
      <Tabs tabs={tabs} active={tab} onChange={(k) => { setTab(k); setPage(1); setSelectedIds(new Set()); }} />
      {batchId && (
        <div className="mx-6 mt-4 px-3 py-2 bg-blue-light/10 border border-blue-light/30 rounded-md text-xs text-blue flex items-center justify-between">
          <span>Showing imported batch only</span>
          <div className="flex items-center gap-3">
            {isSup && (
              <button
                onClick={() => handleOpenBulkAssign("batch", data?.total ?? 0)}
                className="underline font-semibold cursor-pointer"
              >
                Assign Entire Batch ({data?.total ?? 0})
              </button>
            )}
            <a href="/truckers" className="underline font-semibold">View All Truckers</a>
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-surface">
        <DataGrid
          columns={columns}
          data={rows}
          loading={isLoading}
          page={page}
          totalPages={totalPages(data)}
          total={data?.total}
          pageSize={pageSize}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); setSelectedIds(new Set()); }}
          onPageChange={(p) => { setPage(p); setSelectedIds(new Set()); }}
          onRowClick={openDetail}
          toolbar={
            <div className="flex items-center gap-3 flex-1">
              <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search MC#, name..." />
              <Select
                value={filterSalesAgentId}
                onChange={(e) => { setFilterSalesAgentId(e.target.value); setPage(1); setSelectedIds(new Set()); }}
                options={[
                  { value: "", label: "All sales reps" },
                  { value: "__unassigned__", label: "Unassigned (no sales rep)" },
                  ...salesAgentOptions,
                ]}
              />
            </div>
          }
        />
      </div>

      {/* Trucker Detail Modal */}
      <Modal
        open={!!selectedTrucker}
        onClose={() => { setSelectedTrucker(null); setNewStatus(""); setNewSalesAgentId(""); setNewDispatcherId(""); setModalTab("details"); }}
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
                    { key: "is_new_authority", label: "New Authority", tooltip: "Required for New Authority / Less than 90 days" },
                    { key: "uses_quick_pay", label: "Uses Quick Pay" },
                  ] as { key: string; label: string; tooltip?: string }[]).map(({ key, label, tooltip }) => (
                    <label key={key} className="flex items-center gap-2 text-xs cursor-pointer" title={tooltip}>
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
              <Input
                label="City"
                value={editForm.city}
                onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
              />
              <Input
                label="Number of Trucks"
                type="number"
                min="0"
                value={editForm.power_units}
                onChange={(e) => setEditForm({ ...editForm, power_units: e.target.value })}
              />
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Sales Agent</div>
                <div className="mt-0.5 text-txt">{selectedTrucker.sales_agent_name || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Dispatcher</div>
                <div className="mt-0.5 text-txt">{selectedTrucker.dispatcher_name || "—"}</div>
              </div>
            </div>

            {/* Truck Kinds */}
            <div className="mb-4">
              <div className="text-[10px] font-mono text-txt-light uppercase mb-2">Truck Kind(s)</div>
              <div className="flex flex-wrap gap-2">
                {TRUCK_KIND_OPTIONS.map((opt) => {
                  const checked = editForm.truck_types.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2 px-3 py-1.5 border rounded-md text-xs cursor-pointer transition-colors
                        ${checked ? "border-blue bg-blue/5 text-blue" : "border-border text-txt-mid hover:bg-surface-mid"}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEditTruckType(opt.value)}
                        className="accent-blue"
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
              {selectedTrucker.truck_type && !editForm.truck_types.length && (
                <div className="mt-1.5 text-[10px] text-txt-light">Legacy value: {selectedTrucker.truck_type}</div>
              )}
            </div>

            {/* Truck Dimensions */}
            <div className="mb-4">
              <div className="text-[10px] font-mono text-txt-light uppercase mb-2">Truck Dimensions</div>
              <div className="grid grid-cols-4 gap-3">
                <Input
                  label="Length (ft)"
                  type="number"
                  step="0.1"
                  min="0"
                  value={editForm.truck_length_ft}
                  onChange={(e) => setEditForm({ ...editForm, truck_length_ft: e.target.value })}
                />
                <Input
                  label="Width (ft)"
                  type="number"
                  step="0.1"
                  min="0"
                  value={editForm.truck_width_ft}
                  onChange={(e) => setEditForm({ ...editForm, truck_width_ft: e.target.value })}
                />
                <Input
                  label="Height (ft)"
                  type="number"
                  step="0.1"
                  min="0"
                  value={editForm.truck_height_ft}
                  onChange={(e) => setEditForm({ ...editForm, truck_height_ft: e.target.value })}
                />
                <Input
                  label="Max Payload (lbs)"
                  type="number"
                  min="0"
                  value={editForm.max_payload_lbs}
                  onChange={(e) => setEditForm({ ...editForm, max_payload_lbs: e.target.value })}
                />
              </div>
            </div>

            {/* Routes & Availability */}
            <div className="mb-4 pt-4 border-t border-border">
              <RoutesAndAvailabilityFields
                value={editForm.routes}
                onChange={(routes) => setEditForm({ ...editForm, routes })}
              />
            </div>

            {/* Save edits button */}
            {detailDirty && (
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
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Select
                    label="Sales Agent"
                    value={newSalesAgentId}
                    onChange={(e) => setNewSalesAgentId(e.target.value)}
                    options={[
                      { value: "", label: "Unassigned" },
                      ...salesAgentOptions,
                    ]}
                  />
                  <Select
                    label="Dispatcher"
                    value={newDispatcherId}
                    onChange={(e) => setNewDispatcherId(e.target.value)}
                    options={[
                      { value: "", label: "Unassigned" },
                      ...dispatcherOptions,
                    ]}
                  />
                </div>
                <Button
                  onClick={handleAssignAgents}
                  disabled={updateTrucker.isPending || !assignmentsDirty}
                  className="w-full"
                >
                  {updateTrucker.isPending ? "Saving..." : "Save Assignments"}
                </Button>
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
                    onChange={(e) => { setNewStatus(e.target.value); setStatusError(null); }}
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
              <p className="mt-1.5 text-[10px] text-txt-light">
                To fully onboard a trucker: set status to <span className="font-semibold">Start Onboarding</span>,
                then upload the required documents on the Onboarding page and click Mark Fully Onboarded.
              </p>
              {statusError && (
                <div className="mt-2 px-3 py-2 bg-red/5 border border-red/30 rounded-md text-xs text-red">
                  {statusError}
                </div>
              )}
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
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateTruckerErr(null); }} title="Add New Trucker" width="720px">
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="MC Number"
              value={form.mc_number}
              onChange={(e) => setForm({ ...form, mc_number: e.target.value.replace(/\D/g, "") })}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="e.g. 8309847"
              required
            />
            <Input label="Legal Name" value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} required />
            <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <Select
              label="State"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              options={STATE_PROVINCE_OPTIONS}
            />
            <Input
              label="Number of Trucks"
              type="number"
              min="0"
              value={form.power_units}
              onChange={(e) => setForm({ ...form, power_units: e.target.value })}
            />
          </div>

          <div className="mt-4">
            <div className="text-[10px] font-mono text-txt-light uppercase mb-2">Truck Kind(s)</div>
            <div className="flex flex-wrap gap-2">
              {TRUCK_KIND_OPTIONS.map((opt) => {
                const checked = form.truck_types.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2 px-3 py-1.5 border rounded-md text-xs cursor-pointer transition-colors
                      ${checked ? "border-blue bg-blue/5 text-blue" : "border-border text-txt-mid hover:bg-surface-mid"}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTruckType(opt.value)}
                      className="accent-blue"
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <div className="text-[10px] font-mono text-txt-light uppercase mb-2">Truck Dimensions</div>
            <div className="grid grid-cols-4 gap-3">
              <Input
                label="Length (ft)"
                type="number"
                step="0.1"
                min="0"
                value={form.truck_length_ft}
                onChange={(e) => setForm({ ...form, truck_length_ft: e.target.value })}
              />
              <Input
                label="Width (ft)"
                type="number"
                step="0.1"
                min="0"
                value={form.truck_width_ft}
                onChange={(e) => setForm({ ...form, truck_width_ft: e.target.value })}
              />
              <Input
                label="Height (ft)"
                type="number"
                step="0.1"
                min="0"
                value={form.truck_height_ft}
                onChange={(e) => setForm({ ...form, truck_height_ft: e.target.value })}
              />
              <Input
                label="Max Payload (lbs)"
                type="number"
                min="0"
                value={form.max_payload_lbs}
                onChange={(e) => setForm({ ...form, max_payload_lbs: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-border">
            <RoutesAndAvailabilityFields
              value={form.routes}
              onChange={(routes) => setForm({ ...form, routes })}
            />
          </div>
        </div>
        {createTruckerErr && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded">
            {createTruckerErr}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => { setShowCreate(false); setCreateTruckerErr(null); }}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createTrucker.isPending}>
            {createTrucker.isPending ? "Creating..." : "Create Trucker"}
          </Button>
        </div>
      </Modal>

      {/* Bulk Assign Modal */}
      <Modal
        open={!!showBulkAssign}
        onClose={() => setShowBulkAssign(null)}
        title={`Bulk Assign ${showBulkAssign?.count ?? 0} Trucker${showBulkAssign?.count === 1 ? "" : "s"}`}
        width="480px"
      >
        <p className="text-xs text-txt-light mb-4">
          {showBulkAssign?.mode === "batch"
            ? `Apply to every trucker in this upload batch (${showBulkAssign?.count ?? 0}).`
            : `Apply to the ${showBulkAssign?.count ?? 0} selected trucker${showBulkAssign?.count === 1 ? "" : "s"}.`}
          {" "}Leave a field on &quot;Don&apos;t change&quot; to keep its current value.
        </p>
        <div className="space-y-3">
          <Select
            label="Sales Agent"
            value={bulkSalesValue}
            onChange={(e) => setBulkSalesValue(e.target.value)}
            options={[
              { value: "", label: "Don't change" },
              { value: "__unassign__", label: "Clear (Unassigned)" },
              ...salesAgentOptions,
            ]}
          />
          <Select
            label="Dispatcher"
            value={bulkDispatcherValue}
            onChange={(e) => setBulkDispatcherValue(e.target.value)}
            options={[
              { value: "", label: "Don't change" },
              { value: "__unassign__", label: "Clear (Unassigned)" },
              ...dispatcherOptions,
            ]}
          />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => setShowBulkAssign(null)}>Cancel</Button>
          <Button
            onClick={handleConfirmBulkAssign}
            disabled={bulkAssign.isPending || (bulkSalesValue === "" && bulkDispatcherValue === "")}
          >
            {bulkAssign.isPending ? "Saving..." : "Apply"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
