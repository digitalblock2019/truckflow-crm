"use client";

import { useState } from "react";
import Topbar from "@/components/layout/Topbar";
import DataGrid, { Column } from "@/components/ui/DataGrid";
import Tabs from "@/components/ui/Tabs";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import LoadPipeline from "@/components/features/LoadPipeline";
import { useLoads, useCreateLoad, useUpdateLoadStatus, useLoadDocuments, useUploadLoadDocument, useTruckers, useEmployees } from "@/lib/hooks";
import { apiFetch } from "@/lib/api";
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

export default function LoadsPage() {
  const [tab, setTab] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedLoad, setSelectedLoad] = useState<Load | null>(null);
  const isSup = useAuthStore((s) => s.isSupervisorOrAdmin());
  const canCreate = useAuthStore((s) => s.canCreateLoad());

  const { data, isLoading } = useLoads({ status: tab, page, limit: 20 });
  const createLoad = useCreateLoad();
  const updateStatus = useUpdateLoadStatus();
  const { data: loadDocs } = useLoadDocuments(selectedLoad?.id ?? "");
  const uploadLoadDoc = useUploadLoadDocument();
  const { data: truckersData } = useTruckers({ status: "fully_onboarded", limit: 100 });
  const { data: employeesData } = useEmployees({ type: "dispatcher", status: "active", limit: 100 });

  const [form, setForm] = useState({
    trucker_id: "",
    dispatcher_id: "",
    gross_load_amount_cents: "",
    load_origin: "",
    load_destination: "",
  });

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

  const handleCreate = () => {
    createLoad.mutate(
      {
        trucker_id: form.trucker_id,
        dispatcher_id: form.dispatcher_id,
        gross_load_amount_cents: parseInt(form.gross_load_amount_cents) * 100,
        load_origin: form.load_origin,
        load_destination: form.load_destination,
      } as unknown as Partial<Load>,
      {
        onSuccess: () => {
          setShowCreate(false);
          setForm({ trucker_id: "", dispatcher_id: "", gross_load_amount_cents: "", load_origin: "", load_destination: "" });
        },
      }
    );
  };

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
      <div className="flex-1 overflow-y-auto p-6 bg-surface">
        <DataGrid
          columns={columns}
          data={data?.data ?? []}
          loading={isLoading}
          page={page}
          totalPages={totalPages(data)}
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
            <LoadPipeline status={selectedLoad.load_status} />
            <div className="grid grid-cols-2 gap-4 text-xs mb-4">
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Trucker</div>
                <div className="mt-0.5 text-txt">{selectedLoad.trucker_name ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Dispatcher</div>
                <div className="mt-0.5 text-txt">{selectedLoad.dispatcher_name ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Origin</div>
                <div className="mt-0.5 text-txt">{selectedLoad.load_origin ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Destination</div>
                <div className="mt-0.5 text-txt">{selectedLoad.load_destination ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Gross Amount</div>
                <div className="mt-0.5 text-txt font-mono font-semibold">{fmt(selectedLoad.gross_load_amount_cents)}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-txt-light uppercase">Company Net</div>
                <div className="mt-0.5 text-txt font-mono">{fmt(selectedLoad.company_net_cents)}</div>
              </div>
            </div>
            {/* Load Documents */}
            <div className="pt-3 border-t border-border mb-4">
              <h4 className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-3">Documents</h4>
              <div className="grid grid-cols-3 gap-3">
                {(loadDocs ?? []).map((doc: LoadDocument) => {
                  const fileInputId = `load-doc-${doc.doc_type}`;
                  return (
                    <div key={doc.doc_type} className={`border rounded-lg p-3 text-center ${doc.uploaded ? "border-green/40 bg-green/5" : "border-border"}`}>
                      <div className="text-[10px] font-semibold text-txt-mid uppercase mb-2">{doc.label}</div>
                      {doc.uploaded ? (
                        <div>
                          <div className="text-[10px] text-txt-light truncate mb-1" title={doc.file_name ?? ""}>{doc.file_name}</div>
                          <div className="text-[9px] text-txt-light mb-2">{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : ""}</div>
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={async () => {
                                try {
                                  const { url } = await apiFetch<{ url: string }>(`/api/loads/${selectedLoad.id}/documents/${doc.doc_type}/url`);
                                  window.open(url, "_blank");
                                } catch {}
                              }}
                              className="text-[10px] text-blue hover:underline cursor-pointer"
                            >
                              Download
                            </button>
                            <span className="text-txt-light">|</span>
                            <label htmlFor={fileInputId} className="text-[10px] text-blue hover:underline cursor-pointer">Replace</label>
                          </div>
                          <input id={fileInputId} type="file" className="hidden" onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadLoadDoc.mutate({ loadId: selectedLoad.id, docType: doc.doc_type, file: f });
                            e.target.value = "";
                          }} />
                        </div>
                      ) : (
                        <div>
                          <label htmlFor={fileInputId} className="inline-block px-3 py-1.5 text-[10px] font-semibold text-blue border border-blue/30 rounded-md hover:bg-blue/5 cursor-pointer transition-colors">
                            Upload
                          </label>
                          <input id={fileInputId} type="file" className="hidden" onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadLoadDoc.mutate({ loadId: selectedLoad.id, docType: doc.doc_type, file: f });
                            e.target.value = "";
                          }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

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
          </div>
        )}
      </Modal>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New Load" width="560px">
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Trucker"
            value={form.trucker_id}
            onChange={(e) => setForm({ ...form, trucker_id: e.target.value })}
            options={[
              { value: "", label: "Select trucker..." },
              ...(truckersData?.data ?? []).map((t) => ({ value: t.id, label: t.legal_name })),
            ]}
          />
          <Select
            label="Dispatcher"
            value={form.dispatcher_id}
            onChange={(e) => setForm({ ...form, dispatcher_id: e.target.value })}
            options={[
              { value: "", label: "Select dispatcher..." },
              ...(employeesData?.data ?? []).map((e) => ({ value: e.id, label: e.full_name })),
            ]}
          />
          <Input
            label="Gross Amount ($)"
            type="number"
            value={form.gross_load_amount_cents}
            onChange={(e) => setForm({ ...form, gross_load_amount_cents: e.target.value })}
          />
          <Input label="Origin" value={form.load_origin} onChange={(e) => setForm({ ...form, load_origin: e.target.value })} />
          <Input label="Destination" value={form.load_destination} onChange={(e) => setForm({ ...form, load_destination: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createLoad.isPending}>
            {createLoad.isPending ? "Creating..." : "Create Load"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
