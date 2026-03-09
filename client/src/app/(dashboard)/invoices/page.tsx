"use client";

import { useState } from "react";
import Topbar from "@/components/layout/Topbar";
import DataGrid, { Column } from "@/components/ui/DataGrid";
import Tabs from "@/components/ui/Tabs";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import StatCard from "@/components/ui/StatCard";
import { useInvoices, useCreateInvoice, useInvoiceAction, useInvoice, useUpdateInvoice } from "@/lib/hooks";
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
  // Append time to date-only strings to prevent UTC→local timezone shift
  const d = dateStr.length === 10 ? new Date(dateStr + "T00:00:00") : new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function InvoicesPage() {
  const [tab, setTab] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isSup = useAuthStore((s) => s.isSupervisorOrAdmin());
  const canCreate = useAuthStore((s) => s.canCreateInvoice());

  const { data, isLoading } = useInvoices({ status: tab, page, limit: 20 });
  const createInvoice = useCreateInvoice();
  const invoiceAction = useInvoiceAction();
  const { data: invoiceDetail, isLoading: detailLoading } = useInvoice(selectedId);
  const updateInvoice = useUpdateInvoice();

  const [form, setForm] = useState({
    recipient_email: "",
    due_date: "",
    line_items: [{ description: "", quantity: "1", unit_price: "" }],
  });

  const invoices = data?.data ?? [];

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
                <Button size="sm" variant="accent" onClick={(e) => { e.stopPropagation(); invoiceAction.mutate({ id: r.id, action: "mark-paid" }); }}>
                  Mark Paid
                </Button>
              )}
            </div>
          ),
        }]
      : []),
  ];

  const handleCreate = () => {
    const line_items = form.line_items
      .filter((li) => li.description && li.unit_price)
      .map((li) => ({
        description: li.description,
        quantity: parseInt(li.quantity) || 1,
        unit_price_cents: Math.round(parseFloat(li.unit_price) * 100),
      }));

    createInvoice.mutate(
      { recipient_email: form.recipient_email, due_date: form.due_date, line_items },
      {
        onSuccess: () => {
          setShowCreate(false);
          setForm({ recipient_email: "", due_date: "", line_items: [{ description: "", quantity: "1", unit_price: "" }] });
        },
      }
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
      <div className="flex-1 overflow-y-auto p-6 bg-surface">
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
            onPageChange={setPage}
            onRowClick={(row) => setSelectedId(row.id)}
          />
        </div>
      </div>

      {/* Invoice Detail Modal */}
      <Modal open={!!selectedId} onClose={() => setSelectedId(null)} title={invoiceDetail ? `Invoice ${(invoiceDetail as any).invoice_number}` : "Invoice Detail"} width="720px">
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
                  {isDraft && (
                    <Button size="sm" onClick={() => { invoiceAction.mutate({ id: inv.id, action: "send" }); setSelectedId(null); }}>
                      Send Invoice
                    </Button>
                  )}
                  {(inv.status === "sent" || inv.status === "overdue" || inv.status === "viewed") && (
                    <Button size="sm" variant="accent" onClick={() => { invoiceAction.mutate({ id: inv.id, action: "mark-paid" }); setSelectedId(null); }}>
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

              {/* Status + Meta */}
              <div className="flex items-center gap-3 mb-4">
                <Badge color={statusColors[inv.status] ?? "gray"}>{inv.status}</Badge>
                <span className="text-xs text-txt-light">Created {new Date(inv.created_at).toLocaleDateString()}</span>
                {inv.sent_at && <span className="text-xs text-txt-light">Sent {new Date(inv.sent_at).toLocaleDateString()}</span>}
              </div>

              {/* Recipient */}
              <div className="bg-surface rounded-lg p-4 mb-4">
                <h4 className="text-[10px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-2">Bill To</h4>
                {inv.recipient_name && <p className="text-sm font-semibold text-txt">{inv.recipient_name}</p>}
                {inv.recipient_email && <p className="text-xs text-txt-light">{inv.recipient_email}</p>}
                {inv.recipient_address && <p className="text-xs text-txt-light mt-1">{inv.recipient_address}</p>}
              </div>

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
              {inv.notes && (
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

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Invoice" width="600px">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Input
            label="Recipient Email"
            type="email"
            value={form.recipient_email}
            onChange={(e) => setForm({ ...form, recipient_email: e.target.value })}
            required
          />
          <Input
            label="Due Date"
            type="date"
            value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            required
          />
        </div>

        <h4 className="text-[11px] font-semibold text-txt-mid font-mono uppercase tracking-wide mb-2">
          Line Items
        </h4>
        {form.line_items.map((li, i) => (
          <div key={i} className="grid grid-cols-[1fr_80px_100px_30px] gap-2 mb-2 items-end">
            <Input
              label={i === 0 ? "Description" : undefined}
              value={li.description}
              onChange={(e) => updateLineItem(i, "description", e.target.value)}
            />
            <Input
              label={i === 0 ? "Qty" : undefined}
              type="number"
              value={li.quantity}
              onChange={(e) => updateLineItem(i, "quantity", e.target.value)}
            />
            <Input
              label={i === 0 ? "Price ($)" : undefined}
              type="number"
              value={li.unit_price}
              onChange={(e) => updateLineItem(i, "unit_price", e.target.value)}
            />
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setForm({ ...form, line_items: [...form.line_items, { description: "", quantity: "1", unit_price: "" }] })}
        >
          + Add Line
        </Button>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createInvoice.isPending}>
            {createInvoice.isPending ? "Creating..." : "Create Invoice"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
