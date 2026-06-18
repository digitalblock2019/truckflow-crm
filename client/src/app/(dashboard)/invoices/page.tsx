"use client";

import { useState, useEffect } from "react";
import Topbar from "@/components/layout/Topbar";
import DataGrid, { Column } from "@/components/ui/DataGrid";
import Tabs from "@/components/ui/Tabs";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import StatCard from "@/components/ui/StatCard";
import { useInvoices, useCreateInvoice, useInvoiceAction, useInvoice, useUpdateInvoice, useInvoiceableLoads } from "@/lib/hooks";
import { useAuthStore } from "@/lib/auth";
import { totalPages, fmt } from "@/lib/utils";
import type { Invoice } from "@/types";

const statusColors: Record<string, "green" | "blue" | "orange" | "red" | "gray" | "purple"> = {
  draft: "gray",
  sent: "blue",
  viewed: "purple",
  paid: "green",
  overdue: "red",
  cancelled: "gray",
};

const tabs = [
  { key: "", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
];

function fmtCurrency(cents: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function fmtDate(dateStr: string) {
  // Extract YYYY-MM-DD portion to prevent UTC→local timezone shift (DATE columns serialize as ISO strings)
  const str = String(dateStr);
  const datePart = str.includes("T") ? str.split("T")[0] : str.slice(0, 10);
  const d = new Date(datePart + "T00:00:00");
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function InvoicesPage() {
  const [tab, setTab] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [sendPrompt, setSendPrompt] = useState<{ id: string; number: string } | null>(null);
  const [paidPrompt, setPaidPrompt] = useState<{ id: string; number: string; amount: string; client: string } | null>(null);
  const canCreate = useAuthStore((s) => s.canCreateInvoice());

  const { data, isLoading } = useInvoices({ status: tab, page, limit: 100 });
  const createInvoice = useCreateInvoice();
  const invoiceAction = useInvoiceAction();
  const { data: invoiceDetail, isLoading: detailLoading } = useInvoice(selectedId);
  const updateInvoice = useUpdateInvoice();
  const { data: invoiceableData } = useInvoiceableLoads();
  const invoiceableLoads = invoiceableData ?? [];

  const [invoiceTab, setInvoiceTab] = useState<"trucking" | "other">("trucking");

  const emptyForm = {
    load_order_id: "",
    recipient_email: "",
    recipient_name: "",
    // Trucking-specific fields
    mc_number: "",
    pickup: "",
    destination: "",
    delivery_date: "",
    total_load_amount: "",
    loaded_miles: "",
    dispatch_pct: "",
    // Shared
    due_date: "",
    notes: "",
    line_items: [{ description: "", quantity: "1", unit_price: "" }],
  };
  const [form, setForm] = useState(emptyForm);

  // Trucking computed values (live).
  const truckingTotal = parseFloat(form.total_load_amount) || 0;
  const truckingMiles = parseFloat(form.loaded_miles) || 0;
  const truckingDispatchPct = parseFloat(form.dispatch_pct) || 0;
  const perMileRate = truckingMiles > 0 ? truckingTotal / truckingMiles : 0;
  const dispatchAmount = (truckingTotal * truckingDispatchPct) / 100;

  // Edit form state (for draft editing)
  const [editForm, setEditForm] = useState({
    recipient_email: "",
    recipient_name: "",
    due_date: "",
    notes: "",
  });

  const invoices = data?.data ?? [];

  // Populate edit form when entering edit mode
  useEffect(() => {
    if (editMode && invoiceDetail) {
      const inv = invoiceDetail as any;
      const dueDateStr = String(inv.due_date || "");
      const datePart = dueDateStr.includes("T") ? dueDateStr.split("T")[0] : dueDateStr.slice(0, 10);
      setEditForm({
        recipient_email: inv.recipient_email || "",
        recipient_name: inv.recipient_name || "",
        due_date: datePart,
        notes: inv.notes || "",
      });
    }
  }, [editMode, invoiceDetail]);

  const columns: Column<Invoice>[] = [
    { key: "invoice_number", header: "Invoice#", render: (r) => <span className="font-mono font-semibold">{r.invoice_number}</span> },
    { key: "client_name", header: "Client", render: (r) => r.client_name ?? r.recipient_email },
    { key: "total_amount", header: "Total", render: (r) => <span className="font-mono font-semibold">{fmt(r.total_amount)}</span> },
    { key: "status", header: "Status", render: (r) => <Badge color={statusColors[r.status] ?? "gray"}>{r.status}</Badge> },
    { key: "due_date", header: "Due Date", render: (r) => fmtDate(r.due_date) },
    { key: "created_at", header: "Created", render: (r) => fmtDate(r.created_at) },
    ...(canCreate
      ? [{
          key: "actions" as const,
          header: "Actions",
          render: (r: Invoice) => (
            <div className="flex gap-1">
              {r.status === "draft" && (
                <Button size="sm" onClick={(e) => { e.stopPropagation(); invoiceAction.mutate({ id: r.id, action: "send" }); }}>
                  Send
                </Button>
              )}
              {(r.status === "sent" || r.status === "overdue") && (
                <Button size="sm" variant="accent" onClick={(e) => { e.stopPropagation(); setPaidPrompt({ id: r.id, number: r.invoice_number, amount: fmtCurrency(r.total_amount, r.currency), client: r.client_name ?? r.recipient_email }); }}>
                  Mark Paid
                </Button>
              )}
            </div>
          ),
        }]
      : []),
  ];

  const handleCreate = () => {
    let payload: Record<string, unknown>;
    if (invoiceTab === "trucking") {
      // Trucking invoice composes a single line item (Dispatch Commission)
      // and stuffs MC#, miles, total load, and per-mile rate into the Notes
      // field so the recipient sees the freight context.
      const descParts = [
        `Dispatch service: ${form.pickup || "Origin"} → ${form.destination || "Destination"}`,
        form.delivery_date ? `delivered ${form.delivery_date}` : null,
      ].filter(Boolean);
      const noteParts = [
        form.mc_number ? `MC#: ${form.mc_number}` : null,
        form.loaded_miles ? `Loaded miles: ${form.loaded_miles}` : null,
        truckingTotal > 0 ? `Total load: $${truckingTotal.toFixed(2)}` : null,
        perMileRate > 0 ? `Per mile rate: $${perMileRate.toFixed(2)}` : null,
      ].filter(Boolean);
      const combinedNotes = [noteParts.join("\n"), form.notes].filter(Boolean).join("\n\n");
      payload = {
        load_order_id: form.load_order_id || undefined,
        recipient_email: form.recipient_email,
        recipient_name: form.recipient_name || undefined,
        due_date: form.due_date,
        notes: combinedNotes || undefined,
        line_items: [
          {
            description: descParts.join(" — "),
            quantity: 1,
            unit_price_cents: Math.round(dispatchAmount * 100),
          },
        ],
      };
    } else {
      // Other invoice: manual line items, no load linkage.
      const line_items = form.line_items
        .filter((li) => li.description && li.unit_price)
        .map((li) => ({
          description: li.description,
          quantity: parseInt(li.quantity) || 1,
          unit_price_cents: Math.round(parseFloat(li.unit_price) * 100),
        }));
      payload = {
        recipient_email: form.recipient_email,
        recipient_name: form.recipient_name || undefined,
        due_date: form.due_date,
        notes: form.notes || undefined,
        line_items,
      };
    }
    createInvoice.mutate(payload as Parameters<typeof createInvoice.mutate>[0], {
      onSuccess: (created: unknown) => {
        const c = created as { id: string; invoice_number: string };
        setShowCreate(false);
        setForm(emptyForm);
        setInvoiceTab("trucking");
        setSendPrompt({ id: c.id, number: c.invoice_number });
      },
    });
  };

  // Picking a delivered load auto-fills every trucking field (recipient,
  // route, miles, total load, dispatch %). Each field stays editable.
  const handlePickLoad = (loadId: string) => {
    if (!loadId) {
      setForm((f) => ({ ...f, load_order_id: "" }));
      return;
    }
    const load = invoiceableLoads.find((l) => l.id === loadId);
    if (!load) return;
    const pickup =
      [load.origin_city, load.origin_state].filter(Boolean).join(", ") || load.load_origin || "";
    const destination =
      [load.dest_city, load.dest_state].filter(Boolean).join(", ") || load.load_destination || "";
    const deliveryDate = load.delivery_at ? String(load.delivery_at).slice(0, 10) : "";
    setForm((f) => ({
      ...f,
      load_order_id: loadId,
      recipient_email: load.trucker_email || f.recipient_email,
      recipient_name: load.trucker_name || f.recipient_name,
      mc_number: load.mc_number || f.mc_number,
      pickup,
      destination,
      delivery_date: deliveryDate,
      total_load_amount: load.gross_load_amount_cents
        ? (load.gross_load_amount_cents / 100).toFixed(2)
        : f.total_load_amount,
      loaded_miles: load.loaded_miles != null ? String(load.loaded_miles) : f.loaded_miles,
      dispatch_pct: load.company_commission_pct != null
        ? (Number(load.company_commission_pct) * 100).toFixed(2)
        : f.dispatch_pct,
    }));
  };

  const handleSaveEdit = () => {
    if (!selectedId) return;
    updateInvoice.mutate(
      { id: selectedId, ...editForm },
      { onSuccess: () => setEditMode(false) }
    );
  };

  const updateLineItem = (idx: number, field: string, value: string) => {
    const items = [...form.line_items];
    items[idx] = { ...items[idx], [field]: value };
    setForm({ ...form, line_items: items });
  };

  return (
    <>
      <Topbar
        title="Invoices"
        subtitle="Invoice management and billing"
        actions={
          canCreate ? <Button onClick={() => setShowCreate(true)}>+ New Invoice</Button> : undefined
        }
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-surface">
        <div className="grid grid-cols-4 gap-3 mb-5">
          <StatCard label="Total Records" value={data?.total ?? 0} />
          <StatCard label="Drafts" value={invoices.filter((i) => i.status === "draft").length} />
          <StatCard label="Sent" value={invoices.filter((i) => i.status === "sent").length} />
          <StatCard label="Paid" value={invoices.filter((i) => i.status === "paid").length} />
        </div>

        <Tabs tabs={tabs} active={tab} onChange={(k) => { setTab(k); setPage(1); }} />
        <div className="mt-4">
          <DataGrid
            columns={columns}
            data={invoices}
            loading={isLoading}
            page={page}
            totalPages={totalPages(data)}
            total={data?.total}
            pageSize={100}
            onPageChange={setPage}
            onRowClick={(row) => { setSelectedId(row.id); setEditMode(false); }}
          />
        </div>
      </div>

      {/* Invoice Detail Modal */}
      <Modal open={!!selectedId} onClose={() => { setSelectedId(null); setEditMode(false); }} title={invoiceDetail ? `Invoice ${(invoiceDetail as any).invoice_number}` : "Invoice Detail"} width="720px">
        {detailLoading ? (
          <div className="text-xs text-txt-light py-12 text-center">Loading invoice...</div>
        ) : invoiceDetail ? (() => {
          const inv = invoiceDetail as any;
          const lineItems = inv.line_items || [];
          const activity = inv.activity || [];
          const isDraft = inv.status === "draft";
          return (
            <div>
              {/* Action Buttons */}
              {canCreate && (
                <div className="flex gap-2 mb-4">
                  {isDraft && !editMode && (
                    <Button size="sm" variant="secondary" onClick={() => setEditMode(true)}>
                      Edit
                    </Button>
                  )}
                  {isDraft && (
                    <Button size="sm" onClick={() => { invoiceAction.mutate({ id: inv.id, action: "send" }); setSelectedId(null); }}>
                      Send Invoice
                    </Button>
                  )}
                  {(inv.status === "sent" || inv.status === "overdue" || inv.status === "viewed") && (
                    <Button size="sm" variant="accent" onClick={() => { setPaidPrompt({ id: inv.id, number: inv.invoice_number, amount: fmtCurrency(inv.total_amount, inv.currency), client: inv.recipient_name ?? inv.recipient_email }); }}>
                      Mark Paid
                    </Button>
                  )}
                  {inv.status !== "paid" && inv.status !== "cancelled" && (
                    <Button size="sm" variant="secondary" onClick={() => { invoiceAction.mutate({ id: inv.id, action: "cancel", body: { reason: "Cancelled from dashboard" } }); setSelectedId(null); }}>
                      Cancel
                    </Button>
                  )}
                </div>
              )}

              {/* Edit Form (draft only) */}
              {editMode && isDraft ? (
                <div className="bg-surface rounded-lg p-4 mb-4 border border-border">
                  <h4 className="text-[10px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-3">Edit Invoice</h4>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <Input
                      label="Recipient Email"
                      type="email"
                      value={editForm.recipient_email}
                      onChange={(e) => setEditForm({ ...editForm, recipient_email: e.target.value })}
                    />
                    <Input
                      label="Recipient Name"
                      value={editForm.recipient_name}
                      onChange={(e) => setEditForm({ ...editForm, recipient_name: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <Input
                      label="Due Date"
                      type="date"
                      value={editForm.due_date}
                      onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
                    />
                  </div>
                  <Input
                    label="Notes"
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  />
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={handleSaveEdit} disabled={updateInvoice.isPending}>
                      {updateInvoice.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditMode(false)}>
                      Cancel Edit
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Status + Meta */}
                  <div className="flex items-center gap-3 mb-4">
                    <Badge color={statusColors[inv.status] ?? "gray"}>{inv.status}</Badge>
                    <span className="text-xs text-txt-light">Created {fmtDate(inv.created_at)}</span>
                    {inv.sent_at && <span className="text-xs text-txt-light">Sent {fmtDate(inv.sent_at)}</span>}
                  </div>

                  {/* Recipient */}
                  <div className="bg-surface rounded-lg p-4 mb-4">
                    <h4 className="text-[10px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-2">Bill To</h4>
                    {inv.recipient_name && <p className="text-sm font-semibold text-txt">{inv.recipient_name}</p>}
                    {inv.recipient_email && <p className="text-xs text-txt-light">{inv.recipient_email}</p>}
                    {inv.recipient_address && <p className="text-xs text-txt-light mt-1">{inv.recipient_address}</p>}
                  </div>
                </>
              )}

              {/* Line Items Table */}
              <h4 className="text-[10px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-2">Line Items</h4>
              <table className="w-full text-xs mb-4">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-[10px] font-semibold text-txt-mid font-mono uppercase">Description</th>
                    <th className="text-right py-2 text-[10px] font-semibold text-txt-mid font-mono uppercase w-16">Qty</th>
                    <th className="text-right py-2 text-[10px] font-semibold text-txt-mid font-mono uppercase w-24">Unit Price</th>
                    <th className="text-right py-2 text-[10px] font-semibold text-txt-mid font-mono uppercase w-24">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li: any) => (
                    <tr key={li.id} className="border-b border-[#f0f2f5]">
                      <td className="py-2 text-txt">{li.description}</td>
                      <td className="py-2 text-right text-txt-light">{li.quantity}</td>
                      <td className="py-2 text-right font-mono text-txt-light">{fmt(li.unit_price)}</td>
                      <td className="py-2 text-right font-mono font-semibold text-txt">{fmt(li.unit_price * li.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary */}
              <div className="flex justify-end mb-4">
                <div className="w-56 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-txt-light">Subtotal</span>
                    <span className="font-mono">{fmtCurrency(inv.subtotal_amount, inv.currency)}</span>
                  </div>
                  {inv.tax_total_amount > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-txt-light">Tax</span>
                      <span className="font-mono">{fmtCurrency(inv.tax_total_amount, inv.currency)}</span>
                    </div>
                  )}
                  {inv.discount_amount > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-txt-light">Discount</span>
                      <span className="font-mono text-green">-{fmtCurrency(inv.discount_amount, inv.currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold border-t border-border pt-1.5">
                    <span>Total</span>
                    <span className="font-mono">{fmtCurrency(inv.total_amount, inv.currency)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {inv.notes && !editMode && (
                <div className="mb-3">
                  <h4 className="text-[10px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-1">Notes</h4>
                  <p className="text-xs text-txt-light whitespace-pre-line">{inv.notes}</p>
                </div>
              )}

              {/* Stripe Payment Link */}
              {inv.stripe_payment_link_url && (
                <div className="mb-4 p-3 bg-surface rounded-lg">
                  <h4 className="text-[10px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-1">Payment Link</h4>
                  <a href={inv.stripe_payment_link_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline break-all">
                    {inv.stripe_payment_link_url}
                  </a>
                </div>
              )}

              {/* Activity Log */}
              {activity.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-2">Activity</h4>
                  <div className="space-y-1.5">
                    {activity.map((a: any) => (
                      <div key={a.id} className="flex justify-between text-[11px]">
                        <span className="text-txt-light">{a.description}</span>
                        <span className="text-txt-light">{new Date(a.created_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })() : (
          <div className="text-xs text-txt-light py-12 text-center">Invoice not found</div>
        )}
      </Modal>

      {/* Create Invoice Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Invoice" width="640px">
        <Tabs
          tabs={[
            { key: "trucking", label: "Trucking Invoice" },
            { key: "other", label: "Other Invoice" },
          ]}
          active={invoiceTab}
          onChange={(k) => setInvoiceTab(k as "trucking" | "other")}
        />

        {invoiceTab === "trucking" ? (
          <div className="mt-5">
            <div className="mb-4">
              <Select
                label="Link to Load (optional, auto-fills below)"
                value={form.load_order_id}
                onChange={(e) => handlePickLoad(e.target.value)}
                options={[
                  { value: "", label: "— Manual entry (no load) —" },
                  ...invoiceableLoads.map((l) => ({
                    value: l.id,
                    label: `${l.order_number} — ${l.trucker_name ?? "Unknown trucker"} · ${fmtCurrency(l.gross_load_amount_cents)}`,
                  })),
                ]}
              />
              {form.load_order_id && (
                <p className="text-[10px] text-txt-light mt-1">
                  All fields auto-filled from the load. Edit any as needed.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <Input label="Trucker / Company Name" value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} />
              <Input label="MC#" value={form.mc_number} onChange={(e) => setForm({ ...form, mc_number: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <Input label="Recipient Email" type="email" value={form.recipient_email} onChange={(e) => setForm({ ...form, recipient_email: e.target.value })} required />
              <Input label="Due Date" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <Input label="Pickup" value={form.pickup} onChange={(e) => setForm({ ...form, pickup: e.target.value })} placeholder="Tampa, FL" />
              <Input label="Destination" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="Atlanta, GA" />
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <Input label="Delivery Date" type="date" value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} />
              <Input label="Total Load ($)" type="number" step="0.01" value={form.total_load_amount} onChange={(e) => setForm({ ...form, total_load_amount: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <Input label="Loaded Miles" type="number" value={form.loaded_miles} onChange={(e) => setForm({ ...form, loaded_miles: e.target.value })} />
              <Input label="Per Mile Rate ($)" value={perMileRate > 0 ? perMileRate.toFixed(2) : ""} disabled readOnly />
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <Input label="Dispatch %" type="number" step="0.01" value={form.dispatch_pct} onChange={(e) => setForm({ ...form, dispatch_pct: e.target.value })} placeholder="8" />
              <Input label="Dispatch Commission ($)" value={dispatchAmount > 0 ? dispatchAmount.toFixed(2) : ""} disabled readOnly />
            </div>
            <Input label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <p className="text-[10px] text-txt-light mt-2">
              Invoice total = Dispatch Commission (Total Load × Dispatch %). MC#, miles, and per-mile rate are included as notes on the invoice.
            </p>
          </div>
        ) : (
          <div className="mt-5">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <Input label="Recipient Email" type="email" value={form.recipient_email} onChange={(e) => setForm({ ...form, recipient_email: e.target.value })} required />
              <Input label="Recipient Name" value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <Input label="Due Date" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} required />
            </div>

            <h4 className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-2">
              Line Items
            </h4>
            {form.line_items.map((li, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_100px_30px] gap-2 mb-2 items-end">
                <Input label={i === 0 ? "Description" : undefined} value={li.description} onChange={(e) => updateLineItem(i, "description", e.target.value)} />
                <Input label={i === 0 ? "Qty" : undefined} type="number" value={li.quantity} onChange={(e) => updateLineItem(i, "quantity", e.target.value)} />
                <Input label={i === 0 ? "Price ($)" : undefined} type="number" value={li.unit_price} onChange={(e) => updateLineItem(i, "unit_price", e.target.value)} />
                <button
                  onClick={() => {
                    const items = form.line_items.filter((_, idx) => idx !== i);
                    setForm({ ...form, line_items: items.length ? items : [{ description: "", quantity: "1", unit_price: "" }] });
                  }}
                  className="text-red hover:text-red/80 text-lg pb-1 cursor-pointer"
                >
                  &times;
                </button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, line_items: [...form.line_items, { description: "", quantity: "1", unit_price: "" }] })}>
              + Add Line
            </Button>
            <div className="mt-4">
              <Input label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createInvoice.isPending}>
            {createInvoice.isPending ? "Creating..." : "Create Invoice"}
          </Button>
        </div>
      </Modal>

      {/* Mark Paid Confirmation */}
      <Modal open={!!paidPrompt} onClose={() => setPaidPrompt(null)} title="Confirm Mark as Paid" width="420px">
        <div className="text-center py-4">
          <div className="text-3xl mb-3">&#x1F4B0;</div>
          <p className="text-sm text-txt mb-1">
            Mark <span className="font-semibold">{paidPrompt?.number}</span> as paid?
          </p>
          <p className="text-xs text-txt-light mb-1">
            Client: <span className="font-semibold text-txt">{paidPrompt?.client}</span>
          </p>
          <p className="text-xs text-txt-light mb-6">
            Amount: <span className="font-semibold text-txt font-mono">{paidPrompt?.amount}</span>
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="secondary" onClick={() => setPaidPrompt(null)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              onClick={() => {
                if (paidPrompt) {
                  invoiceAction.mutate({ id: paidPrompt.id, action: "mark-paid" });
                  setSelectedId(null);
                }
                setPaidPrompt(null);
              }}
            >
              Confirm Paid
            </Button>
          </div>
        </div>
      </Modal>

      {/* Send Now Prompt */}
      <Modal open={!!sendPrompt} onClose={() => setSendPrompt(null)} title="Invoice Created" width="420px">
        <div className="text-center py-4">
          <div className="text-3xl mb-3">&#x2705;</div>
          <p className="text-sm text-txt mb-1">
            <span className="font-semibold">{sendPrompt?.number}</span> has been created as a draft.
          </p>
          <p className="text-xs text-txt-light mb-6">Would you like to send it to the recipient now?</p>
          <div className="flex justify-center gap-3">
            <Button
              variant="secondary"
              onClick={() => setSendPrompt(null)}
            >
              Keep as Draft
            </Button>
            <Button
              onClick={() => {
                if (sendPrompt) {
                  invoiceAction.mutate({ id: sendPrompt.id, action: "send" });
                }
                setSendPrompt(null);
              }}
            >
              Send Now
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
