"use client";

import { useState } from "react";
import Topbar from "@/components/layout/Topbar";
import DataGrid, { Column } from "@/components/ui/DataGrid";
import Tabs from "@/components/ui/Tabs";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import LoadPipeline from "@/components/features/LoadPipeline";
import CreateLoadModal from "@/components/features/CreateLoadModal";
import Input from "@/components/ui/Input";
import { useLoads, useUpdateLoadStatus, useUpdateLoad, useDeleteLoad, useLoadDocuments, useUploadLoadDocument } from "@/lib/hooks";
import { useAuthStore } from "@/lib/auth";
import { totalPages, fmt } from "@/lib/utils";
import type { Load, LoadDocument } from "@/types";

const statusColors: Record<string, "green" | "blue" | "orange" | "red" | "gray" | "purple"> = {
  pending: "orange",
  dispatched: "blue",
  in_transit: "purple",
  delivered: "green",
  payment_received: "green",
  cancelled: "red",
};

const tabs = [
  { key: "", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "dispatched", label: "Dispatched" },
  { key: "in_transit", label: "In Transit" },
  { key: "delivered", label: "Delivered" },
  { key: "payment_received", label: "Paid" },
];

const nextStatus: Record<string, string> = {
  pending: "dispatched",
  dispatched: "in_transit",
  in_transit: "delivered",
  delivered: "payment_received",
};

const prevStatus: Record<string, string> = {
  dispatched: "pending",
  in_transit: "dispatched",
  delivered: "in_transit",
  payment_received: "delivered",
};

const statusLabel: Record<string, string> = {
  pending: "Pending",
  dispatched: "Dispatched",
  in_transit: "In Transit",
  delivered: "Delivered",
  payment_received: "Paid",
};

// Commission percentages are stored as fractions (0.08 = 8%); format for display.
function pctLabel(pct: string | number | null | undefined): string {
  if (pct == null) return "—";
  const n = Number(pct) * 100;
  if (!Number.isFinite(n)) return "—";
  return `${+n.toFixed(2)}%`;
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] font-mono uppercase tracking-wide text-txt-mid mb-2">{title}</div>
      {children}
    </div>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" />
      <span className="text-txt">{label}</span>
    </label>
  );
}

export default function LoadsPage() {
  const [tab, setTab] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedLoad, setSelectedLoad] = useState<Load | null>(null);
  const isSup = useAuthStore((s) => s.isSupervisorOrAdmin());
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const canCreate = useAuthStore((s) => s.canCreateLoad());

  const { data, isLoading } = useLoads({ status: tab, page, limit: 100 });
  const updateStatus = useUpdateLoadStatus();
  const updateLoad = useUpdateLoad();
  const deleteLoad = useDeleteLoad();
  const { data: loadDocs } = useLoadDocuments(selectedLoad?.id ?? "");
  const uploadLoadDoc = useUploadLoadDocument();

  // Edit mode state. Operational fields only — trucker, gross/component
  // amounts, and commission percentages are locked because changing them
  // would invalidate already-computed commission rows on this load.
  const [isEditingLoad, setIsEditingLoad] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [editErr, setEditErr] = useState<string | null>(null);

  // datetime-local input wants 'YYYY-MM-DDTHH:MM' (no timezone). Strip the
  // 'Z'/offset off whatever the API returns.
  const toLocalDT = (iso: string | null | undefined): string => {
    if (!iso) return "";
    try { return new Date(iso).toISOString().slice(0, 16); } catch { return ""; }
  };

  const startEditLoad = () => {
    if (!selectedLoad) return;
    setEditForm({
      broker_name: selectedLoad.broker_name ?? "",
      broker_mc_number: selectedLoad.broker_mc_number ?? "",
      broker_load_number: (selectedLoad as any).broker_load_number ?? "",
      bol_number: (selectedLoad as any).bol_number ?? "",
      origin_city: selectedLoad.origin_city ?? "",
      origin_state: selectedLoad.origin_state ?? "",
      origin_zip: selectedLoad.origin_zip ?? "",
      dest_city: selectedLoad.dest_city ?? "",
      dest_state: selectedLoad.dest_state ?? "",
      dest_zip: selectedLoad.dest_zip ?? "",
      loaded_miles: selectedLoad.loaded_miles ?? "",
      deadhead_miles: selectedLoad.deadhead_miles ?? "",
      pickup_at: toLocalDT(selectedLoad.pickup_at),
      delivery_at: toLocalDT(selectedLoad.delivery_at),
      equipment_type: selectedLoad.equipment_type ?? "",
      trailer_length_ft: selectedLoad.trailer_length_ft ?? "",
      load_type: selectedLoad.load_type ?? "",
      commodity: selectedLoad.commodity ?? "",
      weight_lbs: selectedLoad.weight_lbs ?? "",
      is_hazmat: !!selectedLoad.is_hazmat,
      tarps_required: !!selectedLoad.tarps_required,
      team_drivers: !!selectedLoad.team_drivers,
      liftgate_required: !!(selectedLoad as any).liftgate_required,
      notes: (selectedLoad as any).notes ?? "",
    });
    setEditErr(null);
    setIsEditingLoad(true);
  };

  const cancelEditLoad = () => { setIsEditingLoad(false); setEditErr(null); };

  const handleSaveLoad = () => {
    if (!selectedLoad) return;
    setEditErr(null);

    // Send only fields that actually changed. Empty strings collapse to null
    // so clearing a field is supported.
    const patch: Record<string, any> = {};
    const numFields = new Set(["loaded_miles", "deadhead_miles", "trailer_length_ft", "weight_lbs"]);
    for (const [k, v] of Object.entries(editForm)) {
      let newVal: any = v;
      if (typeof newVal === "string") newVal = newVal.trim();
      if (newVal === "") newVal = null;
      if (numFields.has(k) && newVal !== null) newVal = Number(newVal);
      const oldVal = (selectedLoad as any)[k] ?? (typeof newVal === "boolean" ? false : null);
      // Boolean comparison is direct; otherwise compare normalized values.
      if (typeof newVal === "boolean") {
        if (newVal !== !!oldVal) patch[k] = newVal;
      } else if (newVal !== oldVal) {
        patch[k] = newVal;
      }
    }

    if (Object.keys(patch).length === 0) { setIsEditingLoad(false); return; }

    updateLoad.mutate(
      { id: selectedLoad.id, ...patch },
      {
        onSuccess: (updated: any) => {
          setSelectedLoad({ ...selectedLoad, ...updated } as Load);
          setIsEditingLoad(false);
        },
        onError: (err: any) => setEditErr(err?.message || "Save failed"),
      },
    );
  };

  // Compact field setter for the form
  const setField = (k: string, v: any) => setEditForm((prev) => ({ ...prev, [k]: v }));

  const columns: Column<Load>[] = [
    { key: "order_number", header: "Order#", render: (r) => <span className="font-mono font-semibold">{r.order_number}</span> },
    { key: "trucker_name", header: "Trucker" },
    { key: "load_origin", header: "Origin" },
    { key: "load_destination", header: "Destination" },
    { key: "load_status", header: "Status", render: (r) => <Badge color={statusColors[r.load_status] ?? "gray"}>{(r.load_status ?? "—").replace(/_/g, " ")}</Badge> },
    { key: "gross_load_amount_cents", header: "Gross", render: (r) => <span className="font-mono">{fmt(r.gross_load_amount_cents)}</span> },
    // Net + Empl Comm are admin/supervisor-only — operational roles
    // (dispatcher, rep) keep a leaner grid.
    ...(isSup
      ? [
          {
            key: "company_net_cents" as const,
            header: "Net",
            render: (r: Load) => <span className="font-mono">{fmt(r.company_net_cents ?? 0)}</span>,
          },
          {
            key: "empl_comm" as const,
            header: "Empl Comm",
            render: (r: Load) => (
              <span className="font-mono">
                {fmt((r.agent_commission_cents ?? 0) + (r.dispatcher_commission_cents ?? 0))}
              </span>
            ),
          },
        ]
      : []),
    { key: "dispatcher_name", header: "Dispatcher" },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleDateString() },
  ];

  return (
    <>
      <Topbar
        title="Loads / Orders"
        subtitle="Manage load records and status pipeline"
        actions={
          canCreate ? <Button onClick={() => setShowCreate(true)}>+ New Load</Button> : undefined
        }
      />
      <Tabs tabs={tabs} active={tab} onChange={(k) => { setTab(k); setPage(1); }} />
      <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-surface">
        <DataGrid
          columns={columns}
          data={data?.data ?? []}
          loading={isLoading}
          page={page}
          totalPages={totalPages(data)}
          total={data?.total}
          pageSize={100}
          onPageChange={setPage}
          onRowClick={(row) => setSelectedLoad(row as unknown as Load)}
        />
      </div>

      <Modal
        open={!!selectedLoad}
        onClose={() => { setSelectedLoad(null); setIsEditingLoad(false); setEditErr(null); }}
        title={selectedLoad ? `Load ${selectedLoad.order_number}${isEditingLoad ? " — Editing" : ""}` : ""}
        width={isEditingLoad ? "720px" : "600px"}
      >
        {selectedLoad && isEditingLoad && (
          <div>
            {/* Edit form. Operational fields only — trucker/amounts/commission% are
                locked because changing them would invalidate the commission rows
                already attached to this load. Change status via the Advance button. */}
            <FormSection title="Broker">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Broker Name"          value={editForm.broker_name}        onChange={(e) => setField("broker_name", e.target.value)} />
                <Input label="Broker MC#"           value={editForm.broker_mc_number}   onChange={(e) => setField("broker_mc_number", e.target.value)} />
                <Input label="Broker Load #"        value={editForm.broker_load_number} onChange={(e) => setField("broker_load_number", e.target.value)} />
                <Input label="BOL #"                value={editForm.bol_number}         onChange={(e) => setField("bol_number", e.target.value)} />
              </div>
            </FormSection>

            <FormSection title="Route">
              <div className="grid grid-cols-3 gap-3 mb-2">
                <Input label="Origin City"  value={editForm.origin_city}  onChange={(e) => setField("origin_city", e.target.value)} />
                <Input label="Origin State" value={editForm.origin_state} onChange={(e) => setField("origin_state", e.target.value)} />
                <Input label="Origin ZIP"   value={editForm.origin_zip}   onChange={(e) => setField("origin_zip", e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Dest City"  value={editForm.dest_city}  onChange={(e) => setField("dest_city", e.target.value)} />
                <Input label="Dest State" value={editForm.dest_state} onChange={(e) => setField("dest_state", e.target.value)} />
                <Input label="Dest ZIP"   value={editForm.dest_zip}   onChange={(e) => setField("dest_zip", e.target.value)} />
              </div>
            </FormSection>

            <FormSection title="Schedule & Distance">
              <div className="grid grid-cols-2 gap-3 mb-2">
                <Input type="datetime-local" label="Pickup"   value={editForm.pickup_at}   onChange={(e) => setField("pickup_at", e.target.value)} />
                <Input type="datetime-local" label="Delivery" value={editForm.delivery_at} onChange={(e) => setField("delivery_at", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" label="Loaded Miles"   value={editForm.loaded_miles}   onChange={(e) => setField("loaded_miles", e.target.value)} />
                <Input type="number" label="Deadhead Miles" value={editForm.deadhead_miles} onChange={(e) => setField("deadhead_miles", e.target.value)} />
              </div>
            </FormSection>

            <FormSection title="Equipment & Freight">
              <div className="grid grid-cols-2 gap-3 mb-2">
                <Input label="Equipment Type"      value={editForm.equipment_type}    onChange={(e) => setField("equipment_type", e.target.value)} />
                <Input type="number" label="Trailer Length (ft)" value={editForm.trailer_length_ft} onChange={(e) => setField("trailer_length_ft", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <Input label="Load Type"  value={editForm.load_type} onChange={(e) => setField("load_type", e.target.value)} />
                <Input label="Commodity" value={editForm.commodity} onChange={(e) => setField("commodity", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" label="Weight (lbs)" value={editForm.weight_lbs} onChange={(e) => setField("weight_lbs", e.target.value)} />
                <div />
              </div>
            </FormSection>

            <FormSection title="Special Handling">
              <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-[13px]">
                <CheckboxField label="Hazmat"            checked={editForm.is_hazmat}         onChange={(v) => setField("is_hazmat", v)} />
                <CheckboxField label="Tarps required"    checked={editForm.tarps_required}    onChange={(v) => setField("tarps_required", v)} />
                <CheckboxField label="Team drivers"      checked={editForm.team_drivers}      onChange={(v) => setField("team_drivers", v)} />
                <CheckboxField label="Liftgate required" checked={editForm.liftgate_required} onChange={(v) => setField("liftgate_required", v)} />
              </div>
            </FormSection>

            <FormSection title="Notes">
              <textarea
                value={editForm.notes}
                onChange={(e) => setField("notes", e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-border rounded-[5px] text-[13px] text-txt bg-white font-sans focus:outline-none focus:border-blue-light focus:ring-[3px] focus:ring-blue-light/10"
                placeholder="Internal notes about this load"
              />
            </FormSection>

            {editErr && (
              <div className="mt-3 px-3 py-2 rounded bg-red-50 border border-red-200 text-red-700 text-[12px]">
                {editErr}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 mt-3 border-t border-border">
              <Button variant="secondary" onClick={cancelEditLoad}>Cancel</Button>
              <Button onClick={handleSaveLoad} disabled={updateLoad.isPending}>
                {updateLoad.isPending ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        )}

        {selectedLoad && !isEditingLoad && (
          <div>
            {/* Compact order details */}
            <div className="grid grid-cols-3 gap-3 text-xs mb-4">
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Trucker</div>
                <div className="mt-0.5 text-txt font-medium">{selectedLoad.trucker_name ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Dispatcher</div>
                <div className="mt-0.5 text-txt font-medium">{selectedLoad.dispatcher_name ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Route</div>
                <div className="mt-0.5 text-txt font-medium">{selectedLoad.load_origin ?? "—"} → {selectedLoad.load_destination ?? "—"}</div>
              </div>
            </div>

            {/* Earnings breakdown */}
            <div className="bg-surface rounded-md border border-border p-3 mb-4 text-xs">
              <div className="text-[10px] font-mono text-txt-light uppercase tracking-wide mb-2">Earnings Breakdown</div>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-txt">Gross</span>
                  <span className="font-mono font-semibold text-txt">{fmt(selectedLoad.gross_load_amount_cents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-txt">
                    Company commission <span className="text-txt-light">({pctLabel(selectedLoad.company_commission_pct)})</span>
                  </span>
                  <span className="font-mono text-txt">{fmt(selectedLoad.company_gross_cents ?? 0)}</span>
                </div>
                <div className="flex justify-between pl-3 text-txt-light">
                  <span>
                    − Dispatcher ({pctLabel(selectedLoad.dispatcher_commission_pct)})
                    {selectedLoad.dispatcher_name ? ` · ${selectedLoad.dispatcher_name}` : ""}
                  </span>
                  <span className="font-mono">-{fmt(selectedLoad.dispatcher_commission_cents ?? 0)}</span>
                </div>
                {selectedLoad.agent_name && (
                  <div className="flex justify-between pl-3 text-txt-light">
                    <span>
                      − Sales agent ({pctLabel(selectedLoad.agent_commission_pct)}) · {selectedLoad.agent_name}
                      {selectedLoad.agent_eligibility === "eligible" &&
                        selectedLoad.agent_threshold_load_num &&
                        selectedLoad.agent_threshold_loads &&
                        ` — load ${selectedLoad.agent_threshold_load_num} of ${selectedLoad.agent_threshold_loads}`}
                      {selectedLoad.agent_eligibility &&
                        selectedLoad.agent_eligibility !== "eligible" &&
                        selectedLoad.agent_eligibility !== "not_applicable" &&
                        ` — ${selectedLoad.agent_eligibility.replace(/_/g, " ")}`}
                    </span>
                    <span className="font-mono">-{fmt(selectedLoad.agent_commission_cents ?? 0)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-1.5 mt-1">
                  <span className="font-semibold text-txt">Company net</span>
                  <span className="font-mono font-bold text-navy">{fmt(selectedLoad.company_net_cents ?? 0)}</span>
                </div>
              </div>
            </div>

            {/* Vertical timeline with inline documents */}
            <h4 className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-3">Delivery Stages</h4>
            <LoadPipeline
              status={selectedLoad.load_status}
              docs={loadDocs ?? []}
              loadId={selectedLoad.id}
              onUpload={(docType, file) =>
                uploadLoadDoc.mutate({ loadId: selectedLoad.id, docType, file })
              }
            />

            {/* Action buttons */}
            {(() => {
              const requiredDocForNext: Record<string, string> = {
                dispatched: "rate_con",
                in_transit: "bol",
                delivered: "pod",
              };
              const next = nextStatus[selectedLoad.load_status];
              const requiredType = next ? requiredDocForNext[next] : undefined;
              const missingDoc = requiredType && !(loadDocs ?? []).find((d: LoadDocument) => d.doc_type === requiredType && d.uploaded);
              const docLabel: Record<string, string> = { rate_con: "Rate Confirmation", bol: "Bill of Lading", pod: "Proof of Delivery" };

              return canCreate && (next || prevStatus[selectedLoad.load_status]) ? (
                <div className="flex justify-between pt-3 border-t border-border">
                  <div>
                    {prevStatus[selectedLoad.load_status] && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          updateStatus.mutate(
                            { id: selectedLoad.id, status: prevStatus[selectedLoad.load_status] },
                            { onSuccess: () => setSelectedLoad(null) }
                          );
                        }}
                        disabled={updateStatus.isPending}
                      >
                        Revert to {statusLabel[prevStatus[selectedLoad.load_status]]}
                      </Button>
                    )}
                  </div>
                  <div className="text-right">
                    {next && (
                      <>
                        <Button
                          onClick={() => {
                            updateStatus.mutate(
                              { id: selectedLoad.id, status: next },
                              { onSuccess: () => setSelectedLoad(null) }
                            );
                          }}
                          disabled={updateStatus.isPending || !!missingDoc}
                          className={missingDoc ? "!opacity-50 !cursor-not-allowed" : ""}
                        >
                          Advance to {statusLabel[next]}
                        </Button>
                        {missingDoc && requiredType && (
                          <p className="text-[10px] text-red mt-1">{docLabel[requiredType]} must be uploaded first</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : null;
            })()}

            {(canCreate || isAdmin) && (
              <div className="flex justify-between pt-3 mt-3 border-t border-border">
                <div>
                  {canCreate && (
                    <Button variant="secondary" onClick={startEditLoad}>
                      Edit Load
                    </Button>
                  )}
                </div>
                <div>
                  {isAdmin && (
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (
                          confirm(
                            `Delete load ${selectedLoad.order_number}? This permanently removes the load and its documents and cannot be undone.`
                          )
                        ) {
                          deleteLoad.mutate(selectedLoad.id, {
                            onSuccess: () => setSelectedLoad(null),
                            onError: (err) =>
                              alert(err instanceof Error ? err.message : "Could not delete load"),
                          });
                        }
                      }}
                      disabled={deleteLoad.isPending}
                    >
                      Delete Load
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <CreateLoadModal open={showCreate} onClose={() => setShowCreate(false)} />
    </>
  );
}
