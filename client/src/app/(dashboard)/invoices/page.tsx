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
import { useInvoices, useCreateInvoice, useInvoiceAction } from "@/lib/hooks";
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

export default function InvoicesPage() {
  const [tab, setTab] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const isSup = useAuthStore((s) => s.isSupervisorOrAdmin());

  const { data, isLoading } = useInvoices({ status: tab, page, limit: 20 });
  const createInvoice = useCreateInvoice();
  const invoiceAction = useInvoiceAction();

  const [form, setForm] = useState({
    recipient_email: "",
    due_date: "",
    line_items: [{ description: "", quantity: "1", unit_price: "" }],
  });

  const invoices = data?.data ?? [];

  const columns: Column<Invoice>[] = [
    { key: "invoice_number", header: "Invoice#", render: (r) => <span className="font-mono font-semibold">{r.invoice_number}</span> },
    { key: "client_name", header: "Client", render: (r) => r.client_name ?? r.recipient_email },
    { key: "total_cents", header: "Total", render: (r) => <span className="font-mono font-semibold">{fmt(r.total_cents)}</span> },
    { key: "status", header: "Status", render: (r) => <Badge color={statusColors[r.status] ?? "gray"}>{r.status}</Badge> },
    { key: "due_date", header: "Due Date", render: (r) => new Date(r.due_date).toLocaleDateString() },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleDateString() },
    ...(isSup
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
          isSup ? <Button onClick={() => setShowCreate(true)}>+ New Invoice</Button> : undefined
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
          />
        </div>
      </div>

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
