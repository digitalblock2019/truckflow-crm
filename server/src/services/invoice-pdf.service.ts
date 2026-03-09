import PDFDocument from 'pdfkit';
import { query } from '../config/database';
import { getSignedUrl } from '../config/storage';

interface LineItem {
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
  logo_file_path?: string;
}

function fmtCurrency(cents: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

function fmtDate(dateStr: string): string {
  // Extract YYYY-MM-DD portion to prevent UTC→local timezone shift (DATE columns serialize as ISO strings)
  const str = String(dateStr);
  const datePart = str.includes('T') ? str.split('T')[0] : str.slice(0, 10);
  const d = new Date(datePart + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export class InvoicePdfService {
  async generatePdf(invoiceId: string): Promise<Buffer> {
    // Fetch invoice data
    const invResult = await query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
    if (!invResult.rows.length) throw new Error('Invoice not found');
    const inv = invResult.rows[0];

    const liResult = await query('SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order', [invoiceId]);
    const lineItems: LineItem[] = liResult.rows;

    const brandingResult = await query('SELECT * FROM invoice_branding LIMIT 1');
    const branding: Branding | null = brandingResult.rows[0] || null;

    // Fetch logo as buffer if available
    let logoBuffer: Buffer | null = null;
    if (branding?.logo_file_path) {
      try {
        const url = await getSignedUrl(branding.logo_file_path);
        const res = await fetch(url);
        if (res.ok) {
          logoBuffer = Buffer.from(await res.arrayBuffer());
        }
      } catch {
        // Skip logo if fetch fails
      }
    }

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 100; // 50 margin each side
      const rightX = doc.page.width - 50;

      // ── Header ──
      let headerY = 50;
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, 50, headerY, { height: 50 });
        } catch {
          // fallback to text
          doc.font('Courier-Bold').fontSize(16).text(branding?.company_name || 'TRUCKFLOW', 50, headerY);
        }
      } else {
        doc.font('Courier-Bold').fontSize(16).text(branding?.company_name || 'TRUCKFLOW', 50, headerY);
      }

      // Company info
      const infoY = headerY + 60;
      doc.font('Helvetica').fontSize(8).fillColor('#64748b');
      let infoLine = infoY;
      if (branding?.company_address) { doc.text(branding.company_address, 50, infoLine); infoLine += 11; }
      if (branding?.company_phone) { doc.text(branding.company_phone, 50, infoLine); infoLine += 11; }
      if (branding?.company_email) { doc.text(branding.company_email, 50, infoLine); infoLine += 11; }

      // Invoice title + number (right side)
      doc.font('Helvetica-Bold').fontSize(24).fillColor('#0f172a')
        .text('INVOICE', rightX - 150, headerY, { width: 150, align: 'right' });
      doc.font('Courier-Bold').fontSize(11).fillColor('#334155')
        .text(inv.invoice_number, rightX - 150, headerY + 30, { width: 150, align: 'right' });

      // Status badge
      const status = inv.status === 'paid' ? 'PAID' : 'UNPAID';
      const statusColor = inv.status === 'paid' ? '#16a34a' : '#ea580c';
      doc.font('Helvetica-Bold').fontSize(9).fillColor(statusColor)
        .text(status, rightX - 150, headerY + 48, { width: 150, align: 'right' });

      // ── Bill To + Dates section ──
      const sectionY = Math.max(infoLine, headerY + 65) + 20;
      doc.moveTo(50, sectionY).lineTo(rightX, sectionY).strokeColor('#e2e8f0').stroke();

      const billY = sectionY + 15;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#94a3b8').text('BILL TO', 50, billY);
      doc.font('Helvetica').fontSize(10).fillColor('#0f172a');
      let billLine = billY + 14;
      if (inv.recipient_name) { doc.text(inv.recipient_name, 50, billLine); billLine += 14; }
      if (inv.recipient_email) { doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(inv.recipient_email, 50, billLine); billLine += 12; }
      if (inv.recipient_address) { doc.text(inv.recipient_address, 50, billLine); billLine += 12; }

      // Dates (right side)
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#94a3b8')
        .text('INVOICE DATE', rightX - 160, billY, { width: 160, align: 'right' });
      doc.font('Helvetica').fontSize(10).fillColor('#334155')
        .text(fmtDate(inv.invoice_date), rightX - 160, billY + 14, { width: 160, align: 'right' });

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#94a3b8')
        .text('DUE DATE', rightX - 160, billY + 34, { width: 160, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#334155')
        .text(fmtDate(inv.due_date), rightX - 160, billY + 48, { width: 160, align: 'right' });

      // ── Line Items Table ──
      const tableY = Math.max(billLine, billY + 65) + 20;
      doc.moveTo(50, tableY).lineTo(rightX, tableY).strokeColor('#e2e8f0').stroke();

      // Table header
      const thY = tableY + 8;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#94a3b8');
      doc.text('DESCRIPTION', 50, thY);
      doc.text('QTY', 340, thY, { width: 50, align: 'right' });
      doc.text('UNIT PRICE', 400, thY, { width: 70, align: 'right' });
      doc.text('TOTAL', rightX - 80, thY, { width: 80, align: 'right' });

      doc.moveTo(50, thY + 16).lineTo(rightX, thY + 16).strokeColor('#e2e8f0').stroke();

      // Table rows
      let rowY = thY + 24;
      for (const li of lineItems) {
        const lineTotal = li.unit_price * li.quantity;
        doc.font('Helvetica').fontSize(9).fillColor('#1e293b');
        doc.text(li.description, 50, rowY, { width: 280 });
        doc.fillColor('#64748b').text(li.quantity.toFixed(2), 340, rowY, { width: 50, align: 'right' });
        doc.text(fmtCurrency(li.unit_price, inv.currency), 400, rowY, { width: 70, align: 'right' });
        doc.font('Helvetica-Bold').fillColor('#1e293b')
          .text(fmtCurrency(lineTotal, inv.currency), rightX - 80, rowY, { width: 80, align: 'right' });

        rowY += 20;
        doc.moveTo(50, rowY - 4).lineTo(rightX, rowY - 4).strokeColor('#f1f5f9').stroke();
      }

      // ── Summary ──
      const sumX = rightX - 200;
      let sumY = rowY + 16;

      doc.font('Helvetica').fontSize(9).fillColor('#64748b')
        .text('Subtotal', sumX, sumY, { width: 120, align: 'right' });
      doc.font('Courier').fillColor('#334155')
        .text(fmtCurrency(inv.subtotal_amount, inv.currency), rightX - 80, sumY, { width: 80, align: 'right' });
      sumY += 16;

      if (inv.tax_total_amount > 0) {
        doc.font('Helvetica').fillColor('#64748b')
          .text('Tax', sumX, sumY, { width: 120, align: 'right' });
        doc.font('Courier').fillColor('#334155')
          .text(fmtCurrency(inv.tax_total_amount, inv.currency), rightX - 80, sumY, { width: 80, align: 'right' });
        sumY += 16;
      }

      if (inv.discount_amount > 0) {
        doc.font('Helvetica').fillColor('#64748b')
          .text('Discount', sumX, sumY, { width: 120, align: 'right' });
        doc.font('Courier').fillColor('#16a34a')
          .text('-' + fmtCurrency(inv.discount_amount, inv.currency), rightX - 80, sumY, { width: 80, align: 'right' });
        sumY += 16;
      }

      // Total
      doc.moveTo(sumX, sumY).lineTo(rightX, sumY).strokeColor('#e2e8f0').stroke();
      sumY += 8;
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a')
        .text('Total', sumX, sumY, { width: 120, align: 'right' });
      doc.font('Courier-Bold').fontSize(11)
        .text(fmtCurrency(inv.total_amount, inv.currency), rightX - 80, sumY, { width: 80, align: 'right' });

      // ── Notes ──
      if (inv.notes) {
        sumY += 30;
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#94a3b8').text('NOTES', 50, sumY);
        doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(inv.notes, 50, sumY + 14, { width: pageWidth });
      }

      // ── Footer ──
      const footerY = doc.page.height - 60;
      const brandingRes2 = brandingResult.rows[0];
      if (brandingRes2?.invoice_footer_text) {
        doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
          .text(brandingRes2.invoice_footer_text, 50, footerY, { width: pageWidth, align: 'center' });
      }

      doc.end();
    });
  }
}
