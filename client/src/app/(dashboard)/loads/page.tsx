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
import { useLoads, useUpdateLoadStatus, useDeleteLoad, useLoadDocuments, useUploadLoadDocument } from "@/lib/hooks";
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

export default function LoadsPage() {
  const [tab, setTab] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedLoad, setSelectedLoad] = useState<Load | null>(null);
  const isSup = useAuthStore((s) => s.isSupervisorOrAdmin());
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const canCreate = useAuthStore((s) => s.canCreateLoad());

  const { data, isLoading } = useLoads({ status: tab, page, limit: 20 });
  const updateStatus = useUpdateLoadStatus();
  const deleteLoad = useDeleteLoad();
  const { data: loadDocs } = useLoadDocuments(selectedLoad?.id ?? "");
  const uploadLoadDoc = useUploadLoadDocument();

  const columns: Column<Load>[] = [
    { key: "order_number", header: "Order#", render: (r) => <span className="font-mono font-semibold">{r.order_number}</span> },
    { key: "trucker_name", header: "Trucker" },
    { key: "load_origin", header: "Origin" },
    { key: "load_destination", header: "Destination" },
    { key: "load_status", header: "Status", render: (r) => <Badge color={statusColors[r.load_status] ?? "gray"}>{(r.load_status ?? "—").replace(/_/g, " ")}</Badge> },
    { key: "gross_load_amount_cents", header: "Gross", render: (r) => <span className="font-mono">{fmt(r.gross_load_amount_cents)}</span> },
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
          pageSize={20}
          onPageChange={setPage}
          onRowClick={(row) => setSelectedLoad(row as unknown as Load)}
        />
      </div>

      <Modal
        open={!!selectedLoad}
        onClose={() => setSelectedLoad(null)}
        title={selectedLoad ? `Load ${selectedLoad.order_number}` : ""}
        width="600px"
      >
        {selectedLoad && (
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

            {isAdmin && (
              <div className="flex justify-end pt-3 mt-3 border-t border-border">
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
              </div>
            )}
          </div>
        )}
      </Modal>

      <CreateLoadModal open={showCreate} onClose={() => setShowCreate(false)} />
    </>
  );
}
