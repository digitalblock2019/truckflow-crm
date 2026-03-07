"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_amount?: number;
}

interface Branding {
  company_name?: string;
  company_address?: string;
  company_phone?: string;
  company_email?: string;
  company_website?: string;
  logo_url?: string;
  invoice_footer_text?: string;
  wise_email?: string;
}

interface InvoiceData {
  id: string;
  invoice_number: string;
  status: string;
  recipient_name?: string;
  recipient_email?: string;
  recipient_address?: string;
  recipient_tax_id?: string;
  currency: string;
  subtotal_amount: number;
  tax_total_amount: number;
  discount_amount: number;
  total_amount: number;
  invoice_date: string;
  due_date: string;
  notes?: string;
  terms?: string;
  stripe_payment_link_url?: string;
  line_items: LineItem[];
  branding: Branding | null;
}

function fmtCurrency(cents: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-50 text-blue-600",
  viewed: "bg-purple-50 text-purple-600",
  paid: "bg-green-50 text-green-700",
  overdue: "bg-red-50 text-red-600",
  cancelled: "bg-gray-100 text-gray-500",
};

export default function PublicInvoiceView() {
  const params = useParams();
  const token = params.token as string;
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/invoice/view/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("Invoice not found");
        return r.json();
      })
      .then((data) => setInvoice(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading invoice...</div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Invoice Not Found</h1>
          <p className="text-gray-500 text-sm">This invoice link may have expired or is invalid.</p>
        </div>
      </div>
    );
  }

  const b = invoice.branding;

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-[800px] mx-auto bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Header */}
        <div className="p-8 pb-6 border-b border-gray-100">
          <div className="flex justify-between items-start">
            {/* Company Info */}
            <div>
              {b?.logo_url ? (
                <img src={b.logo_url} alt="Logo" className="h-12 mb-3 object-contain" />
              ) : (
                <h1 className="text-xl font-bold text-gray-900 mb-1 font-mono tracking-wider">
                  {b?.company_name || "TRUCKFLOW"}
                </h1>
              )}
              {b?.company_address && (
                <p className="text-xs text-gray-500 whitespace-pre-line">{b.company_address}</p>
              )}
              {b?.company_phone && (
                <p className="text-xs text-gray-500">{b.company_phone}</p>
              )}
              {b?.company_email && (
                <p className="text-xs text-gray-500">{b.company_email}</p>
              )}
            </div>

            {/* Invoice Meta */}
            <div className="text-right">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">INVOICE</h2>
              <p className="font-mono text-sm font-semibold text-gray-700">{invoice.invoice_number}</p>
              <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${statusColors[invoice.status] || "bg-gray-100 text-gray-600"}`}>
                {invoice.status}
              </span>
            </div>
          </div>
        </div>

        {/* Dates + Bill To */}
        <div className="px-8 py-6 grid grid-cols-2 gap-8 border-b border-gray-100">
          <div>
            <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Bill To</h3>
            {invoice.recipient_name && (
              <p className="text-sm font-semibold text-gray-900">{invoice.recipient_name}</p>
            )}
            {invoice.recipient_email && (
              <p className="text-xs text-gray-500">{invoice.recipient_email}</p>
            )}
            {invoice.recipient_address && (
              <p className="text-xs text-gray-500 mt-1 whitespace-pre-line">{invoice.recipient_address}</p>
            )}
            {invoice.recipient_tax_id && (
              <p className="text-xs text-gray-500 mt-1">Tax ID: {invoice.recipient_tax_id}</p>
            )}
          </div>
          <div className="text-right">
            <div className="mb-3">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Invoice Date</div>
              <div className="text-sm text-gray-700">{fmtDate(invoice.invoice_date)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Due Date</div>
              <div className="text-sm text-gray-700 font-semibold">{fmtDate(invoice.due_date)}</div>
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="px-8 py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Description</th>
                <th className="text-right py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-20">Qty</th>
                <th className="text-right py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-28">Unit Price</th>
                <th className="text-right py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-28">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.line_items.map((li) => (
                <tr key={li.id} className="border-b border-gray-50">
                  <td className="py-3 text-gray-800">{li.description}</td>
                  <td className="py-3 text-right text-gray-600">{li.quantity}</td>
                  <td className="py-3 text-right font-mono text-gray-600">
                    {fmtCurrency(li.unit_price, invoice.currency)}
                  </td>
                  <td className="py-3 text-right font-mono font-semibold text-gray-800">
                    {fmtCurrency(li.unit_price * li.quantity, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summary */}
          <div className="mt-6 flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-mono text-gray-700">{fmtCurrency(invoice.subtotal_amount, invoice.currency)}</span>
              </div>
              {invoice.tax_total_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tax</span>
                  <span className="font-mono text-gray-700">{fmtCurrency(invoice.tax_total_amount, invoice.currency)}</span>
                </div>
              )}
              {invoice.discount_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Discount</span>
                  <span className="font-mono text-green-600">-{fmtCurrency(invoice.discount_amount, invoice.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2">
                <span className="text-gray-900">Total</span>
                <span className="font-mono text-gray-900">{fmtCurrency(invoice.total_amount, invoice.currency)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice.notes && (
          <div className="px-8 pb-4">
            <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</h3>
            <p className="text-xs text-gray-600 whitespace-pre-line">{invoice.notes}</p>
          </div>
        )}

        {/* Terms */}
        {invoice.terms && (
          <div className="px-8 pb-4">
            <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Terms & Conditions</h3>
            <p className="text-xs text-gray-500 whitespace-pre-line">{invoice.terms}</p>
          </div>
        )}

        {/* Payment Section */}
        {invoice.status !== "paid" && invoice.status !== "cancelled" && (
          <div className="px-8 py-6 bg-gray-50 border-t border-gray-100 rounded-b-lg">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Payment Options</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              {invoice.stripe_payment_link_url && (
                <a
                  href={invoice.stripe_payment_link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center px-6 py-3 bg-[#635BFF] text-white text-sm font-semibold rounded-lg hover:bg-[#5046e4] transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-7.076-2.19l-.893 5.575C4.746 22.901 7.819 24 11.852 24c2.6 0 4.735-.635 6.235-1.866 1.614-1.317 2.427-3.25 2.427-5.74.006-4.116-2.502-5.804-6.538-7.244z"/>
                  </svg>
                  Pay Now with Stripe
                </a>
              )}
              {b?.wise_email && (
                <div className="flex items-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded-lg">
                  <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Pay via Wise</div>
                    <div className="text-sm font-mono text-gray-700">{b.wise_email}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Paid Badge */}
        {invoice.status === "paid" && (
          <div className="px-8 py-6 bg-green-50 border-t border-green-100 rounded-b-lg text-center">
            <div className="inline-flex items-center gap-2 text-green-700 font-semibold">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              This invoice has been paid
            </div>
          </div>
        )}

        {/* Footer */}
        {b?.invoice_footer_text && (
          <div className="px-8 py-4 border-t border-gray-100">
            <p className="text-[11px] text-gray-400 text-center">{b.invoice_footer_text}</p>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-gray-400 mt-6">
        Powered by TruckFlow CRM
      </p>
    </div>
  );
}
