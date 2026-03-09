import crypto from 'crypto';
import path from 'path';
import { query } from '../config/database';
import { AppError } from '../utils/AppError';
import { uploadFile, getSignedUrl } from '../config/storage';
import { createPaymentLink } from '../config/stripe';
import { EmailService } from './email.service';

export class InvoicesService {
  // ── Clients ──
  async listClients(filters: any) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (filters.search) {
      conditions.push(`(ic.company_name ILIKE $${idx} OR ic.email ILIKE $${idx})`);
      params.push(`%${filters.search}%`); idx++;
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = filters.limit || 50;
    const offset = ((filters.page || 1) - 1) * limit;

    const count = await query(`SELECT count(*) FROM invoice_clients ic ${where}`, params);
    const data = await query(
      `SELECT * FROM invoice_clients ic ${where} ORDER BY ic.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );
    return { data: data.rows, total: parseInt(count.rows[0].count), page: filters.page || 1, limit };
  }

  async createClient(data: any, userId: string) {
    const result = await query(
      `INSERT INTO invoice_clients (company_name, contact_name, email, billing_address, city, state_province,
       postal_code, country, tax_id, currency_default, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [data.company_name, data.contact_name, data.email, data.billing_address, data.city,
       data.state_province, data.postal_code, data.country, data.tax_id, data.currency_default || 'USD', data.notes, userId]
    );
    return result.rows[0];
  }

  async updateClient(id: string, data: any) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = $${idx++}`); values.push(value);
    }
    if (!fields.length) throw new AppError('No fields to update', 400, 'VALIDATION_ERROR');
    fields.push('updated_at = NOW()');
    values.push(id);
    await query(`UPDATE invoice_clients SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    const result = await query('SELECT * FROM invoice_clients WHERE id = $1', [id]);
    if (!result.rows.length) throw new AppError('Client not found', 404, 'NOT_FOUND');
    return result.rows[0];
  }

  // ── Tax Rates ──
  async listTaxRates() {
    const data = await query('SELECT * FROM invoice_tax_rates WHERE is_active = TRUE ORDER BY name');
    return data.rows;
  }

  async createTaxRate(data: any, userId: string) {
    const result = await query(
      'INSERT INTO invoice_tax_rates (name, rate, description, is_default, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [data.name, data.rate, data.description, data.is_default || false, userId]
    );
    return result.rows[0];
  }

  // ── Invoices ──
  async listInvoices(filters: any) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (filters.status) { conditions.push(`i.status = $${idx++}`); params.push(filters.status); }
    if (filters.client_id) { conditions.push(`i.client_id = $${idx++}`); params.push(filters.client_id); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const limit = filters.limit || 50;
    const offset = ((filters.page || 1) - 1) * limit;

    const count = await query(`SELECT count(*) FROM invoices i ${where}`, params);
    const data = await query(
      `SELECT i.*, ic.company_name as client_name FROM invoices i
       LEFT JOIN invoice_clients ic ON ic.id = i.client_id
       ${where} ORDER BY i.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );
    return { data: data.rows, total: parseInt(count.rows[0].count), page: filters.page || 1, limit };
  }

  async createInvoice(data: any, userId: string) {
    const viewToken = crypto.randomBytes(32).toString('hex');

    // Auto-compute totals from line items if not provided
    let subtotalAmount = data.subtotal_amount || 0;
    let totalAmount = data.total_amount || 0;
    if (data.line_items && Array.isArray(data.line_items) && data.line_items.length > 0) {
      const computedSubtotal = data.line_items.reduce((sum: number, li: any) => {
        const unitPrice = li.unit_price ?? li.unit_price_cents ?? 0;
        const qty = li.quantity || 1;
        return sum + (unitPrice * qty);
      }, 0);
      if (!subtotalAmount) subtotalAmount = computedSubtotal;
      if (!totalAmount) totalAmount = computedSubtotal + (data.tax_total_amount || 0) - (data.discount_amount || 0);
    }

    const result = await query(
      `INSERT INTO invoices (trigger, load_order_id, client_id, recipient_email, recipient_name,
       recipient_address, recipient_tax_id, currency, subtotal_amount, tax_total_amount,
       discount_amount, total_amount, invoice_date, payment_terms, custom_due_days, due_date,
       notes, terms, internal_notes, view_token, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13::date, CURRENT_DATE),$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
      [data.trigger || 'manual', data.load_order_id, data.client_id, data.recipient_email,
       data.recipient_name, data.recipient_address, data.recipient_tax_id,
       data.currency || 'USD', subtotalAmount, data.tax_total_amount || 0,
       data.discount_amount || 0, totalAmount, data.invoice_date || null,
       data.payment_terms || 'net_30', data.custom_due_days, data.due_date,
       data.notes, data.terms, data.internal_notes, viewToken, userId]
    );

    const invoiceId = result.rows[0].id;

    // Insert line items
    if (data.line_items && Array.isArray(data.line_items)) {
      for (let i = 0; i < data.line_items.length; i++) {
        const li = data.line_items[i];
        const unitPrice = li.unit_price ?? li.unit_price_cents;
        await query(
          `INSERT INTO invoice_line_items (invoice_id, sort_order, description, quantity, unit_price, tax_rate_id, tax_rate_value, tax_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [invoiceId, i, li.description, li.quantity || 1, unitPrice, li.tax_rate_id, li.tax_rate_value, li.tax_amount]
        );
      }
    }

    // Insert tax lines
    if (data.tax_lines && Array.isArray(data.tax_lines)) {
      for (const tl of data.tax_lines) {
        await query(
          `INSERT INTO invoice_tax_lines (invoice_id, tax_rate_id, name, rate, applies_to_amount, tax_amount)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [invoiceId, tl.tax_rate_id, tl.name, tl.rate, tl.applies_to_amount, tl.tax_amount]
        );
      }
    }

    // Activity log
    await query(
      `INSERT INTO invoice_activity (invoice_id, event_type, description, actor_id)
       VALUES ($1, 'created', 'Invoice created', $2)`, [invoiceId, userId]
    );

    return result.rows[0];
  }

  async getInvoice(id: string) {
    const inv = await query(
      `SELECT i.*, ic.company_name as client_name FROM invoices i
       LEFT JOIN invoice_clients ic ON ic.id = i.client_id WHERE i.id = $1`, [id]
    );
    if (!inv.rows.length) throw new AppError('Invoice not found', 404, 'NOT_FOUND');

    const lineItems = await query('SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order', [id]);
    const taxLines = await query('SELECT * FROM invoice_tax_lines WHERE invoice_id = $1', [id]);
    const activity = await query('SELECT * FROM invoice_activity WHERE invoice_id = $1 ORDER BY created_at DESC', [id]);

    return { ...inv.rows[0], line_items: lineItems.rows, tax_lines: taxLines.rows, activity: activity.rows };
  }

  async updateInvoice(id: string, data: any, userId: string) {
    const existing = await query('SELECT * FROM invoices WHERE id = $1', [id]);
    if (!existing.rows.length) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
    if (!['draft'].includes(existing.rows[0].status)) throw new AppError('Can only edit draft invoices', 422, 'INVALID_STATE');

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    const allowed = ['recipient_email', 'recipient_name', 'recipient_address', 'recipient_tax_id',
      'subtotal_amount', 'tax_total_amount', 'discount_amount', 'total_amount',
      'payment_terms', 'custom_due_days', 'due_date', 'notes', 'terms', 'internal_notes'];
    for (const [key, value] of Object.entries(data)) {
      if (allowed.includes(key)) { fields.push(`${key} = $${idx++}`); values.push(value); }
    }
    if (!fields.length) throw new AppError('No valid fields to update', 400, 'VALIDATION_ERROR');
    fields.push('updated_at = NOW()');
    values.push(id);
    await query(`UPDATE invoices SET ${fields.join(', ')} WHERE id = $${idx}`, values);

    await query(`INSERT INTO invoice_activity (invoice_id, event_type, description, actor_id) VALUES ($1, 'updated', 'Invoice updated', $2)`, [id, userId]);
    return this.getInvoice(id);
  }

  async sendInvoice(id: string, userId: string) {
    const inv = await query('SELECT * FROM invoices WHERE id = $1', [id]);
    if (!inv.rows.length) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
    if (!['draft', 'sent'].includes(inv.rows[0].status)) throw new AppError('Cannot send this invoice', 422, 'INVALID_STATE');

    const invoice = inv.rows[0];

    // Generate Stripe Payment Link if not already created
    let stripeUrl = invoice.stripe_payment_link_url;
    if (!stripeUrl && invoice.total_amount > 0) {
      try {
        const link = await createPaymentLink(
          invoice.invoice_number,
          invoice.total_amount,
          invoice.currency
        );
        if (link) {
          stripeUrl = link.url;
          await query(
            'UPDATE invoices SET stripe_payment_link_id=$1, stripe_payment_link_url=$2 WHERE id=$3',
            [link.id, link.url, id]
          );
        }
      } catch (err) {
        console.error('[SendInvoice] Stripe payment link creation failed:', err);
      }
    }

    await query(`UPDATE invoices SET status='sent', sent_at=NOW(), updated_at=NOW() WHERE id=$1`, [id]);
    await query(`INSERT INTO invoice_activity (invoice_id, event_type, description, actor_id) VALUES ($1, 'sent', 'Invoice sent', $2)`, [id, userId]);

    // Send email to recipient
    if (invoice.recipient_email) {
      try {
        const appUrl = process.env.APP_URL || 'https://www.truckflowcrm.com';
        const viewLink = `${appUrl}/invoice-view/${invoice.view_token}`;

        // Fetch branding for logo and company name
        const branding = await this.getBranding();
        const logoUrl = branding?.logo_url || undefined;
        const companyName = branding?.company_name || undefined;

        const emailService = new EmailService();
        await emailService.sendInvoiceEmail(
          invoice.recipient_email,
          invoice.recipient_name || '',
          invoice.invoice_number,
          invoice.total_amount,
          invoice.currency || 'USD',
          invoice.due_date,
          viewLink,
          stripeUrl || undefined,
          logoUrl,
          companyName
        );
      } catch (err) {
        console.error('[SendInvoice] Email send failed:', err);
      }
    }

    return { message: 'Invoice sent' };
  }

  async markPaid(id: string, data: any, userId: string) {
    const inv = await query('SELECT * FROM invoices WHERE id = $1', [id]);
    if (!inv.rows.length) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
    const invoice = inv.rows[0];

    await query(
      `UPDATE invoices SET status='paid', paid_at=NOW(), paid_by=$1, payment_reference=$2, updated_at=NOW() WHERE id=$3`,
      [userId, data.payment_reference, id]
    );
    await query(`INSERT INTO invoice_activity (invoice_id, event_type, description, actor_id) VALUES ($1, 'marked_paid', 'Marked as paid', $2)`, [id, userId]);

    // Generate PDF and send paid confirmation emails
    try {
      const appUrl = process.env.APP_URL || 'https://www.truckflowcrm.com';
      const viewLink = `${appUrl}/invoice-view/${invoice.view_token}`;
      const branding = await this.getBranding();
      const logoUrl = branding?.logo_url || undefined;
      const companyName = branding?.company_name || undefined;
      const emailService = new EmailService();

      const formattedTotal = new Intl.NumberFormat('en-US', {
        style: 'currency', currency: invoice.currency || 'USD',
      }).format(invoice.total_amount / 100);

      // Generate invoice PDF
      let pdfBuffer: Buffer | undefined;
      try {
        const { InvoicePdfService } = await import('./invoice-pdf.service');
        const pdfService = new InvoicePdfService();
        pdfBuffer = await pdfService.generatePdf(invoice.id);
      } catch (pdfErr) {
        console.error('[MarkPaid] PDF generation failed, sending without attachment:', pdfErr);
      }

      // 1. Email to recipient (trucker/client)
      if (invoice.recipient_email) {
        await emailService.sendInvoicePaidEmail(
          invoice.recipient_email,
          invoice.recipient_name || '',
          invoice.invoice_number,
          formattedTotal,
          viewLink,
          logoUrl,
          companyName,
          'recipient',
          pdfBuffer
        );
      }

      // 2. Email to admins, supervisors, and invoice creator
      const teamResult = await query(
        `SELECT DISTINCT u.email, u.full_name FROM users u
         WHERE u.is_active = TRUE AND (u.role IN ('admin', 'supervisor') OR u.id = $1)`,
        [invoice.created_by]
      );
      for (const member of teamResult.rows) {
        await emailService.sendInvoicePaidEmail(
          member.email,
          member.full_name,
          invoice.invoice_number,
          formattedTotal,
          viewLink,
          logoUrl,
          companyName,
          'team',
          pdfBuffer
        );
      }
    } catch (err) {
      console.error('[MarkPaid] Paid notification emails failed:', err);
    }

    return { message: 'Invoice marked as paid' };
  }

  async cancelInvoice(id: string, reason: string, userId: string) {
    await query(
      `UPDATE invoices SET status='cancelled', cancelled_at=NOW(), cancelled_by=$1, cancellation_reason=$2, updated_at=NOW() WHERE id=$3`,
      [userId, reason, id]
    );
    await query(`INSERT INTO invoice_activity (invoice_id, event_type, description, actor_id) VALUES ($1, 'cancelled', $2, $3)`, [id, reason, userId]);
    return { message: 'Invoice cancelled' };
  }

  async suppressReminders(id: string, userId: string) {
    await query('UPDATE invoices SET reminders_suppressed = TRUE, updated_at = NOW() WHERE id = $1', [id]);
    await query(`INSERT INTO invoice_activity (invoice_id, event_type, description, actor_id) VALUES ($1, 'suppressed_reminders', 'Reminders suppressed', $2)`, [id, userId]);
    return { message: 'Reminders suppressed' };
  }

  async getInvoicePdf(id: string) {
    const inv = await query('SELECT pdf_file_path, invoice_number FROM invoices WHERE id = $1', [id]);
    if (!inv.rows.length) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
    return { pdf_url: inv.rows[0].pdf_file_path || `placeholder://pdfs/${inv.rows[0].invoice_number}.pdf` };
  }

  async viewByToken(viewToken: string) {
    const inv = await query('SELECT * FROM invoices WHERE view_token = $1', [viewToken]);
    if (!inv.rows.length) throw new AppError('Invoice not found', 404, 'NOT_FOUND');

    // Mark as viewed if first time
    if (!inv.rows[0].viewed_at) {
      await query('UPDATE invoices SET viewed_at = NOW(), status = CASE WHEN status = \'sent\' THEN \'viewed\' ELSE status END WHERE id = $1', [inv.rows[0].id]);
      await query(`INSERT INTO invoice_activity (invoice_id, event_type, description) VALUES ($1, 'viewed', 'Invoice viewed by recipient')`, [inv.rows[0].id]);
    }

    const lineItems = await query('SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order', [inv.rows[0].id]);
    const taxLines = await query('SELECT * FROM invoice_tax_lines WHERE invoice_id = $1', [inv.rows[0].id]);
    const brandingResult = await query('SELECT * FROM invoice_branding LIMIT 1');
    const branding = brandingResult.rows[0] || null;
    if (branding?.logo_file_path) {
      try {
        branding.logo_url = await getSignedUrl(branding.logo_file_path);
      } catch {
        branding.logo_url = null;
      }
    }

    return { ...inv.rows[0], line_items: lineItems.rows, tax_lines: taxLines.rows, branding };
  }

  // ── Reminder Rules ──
  async listReminderRules() {
    const data = await query('SELECT * FROM invoice_reminder_rules ORDER BY sort_order');
    return data.rows;
  }

  async updateReminderRule(id: string, data: any) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = $${idx++}`); values.push(value);
    }
    if (!fields.length) throw new AppError('No fields', 400, 'VALIDATION_ERROR');
    fields.push('updated_at = NOW()');
    values.push(id);
    await query(`UPDATE invoice_reminder_rules SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    const result = await query('SELECT * FROM invoice_reminder_rules WHERE id = $1', [id]);
    return result.rows[0];
  }

  // ── Branding ──
  async getBranding() {
    const data = await query('SELECT * FROM invoice_branding LIMIT 1');
    const branding = data.rows[0] || null;
    if (branding?.logo_file_path) {
      try {
        branding.logo_url = await getSignedUrl(branding.logo_file_path);
      } catch {
        branding.logo_url = null;
      }
    }
    return branding;
  }

  async updateBranding(data: any, userId: string) {
    const existing = await query('SELECT id FROM invoice_branding LIMIT 1');
    if (existing.rows.length) {
      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;
      for (const [key, value] of Object.entries(data)) {
        fields.push(`${key} = $${idx++}`); values.push(value);
      }
      fields.push(`updated_by = $${idx++}`, 'updated_at = NOW()');
      values.push(userId, existing.rows[0].id);
      await query(`UPDATE invoice_branding SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    } else {
      await query(
        `INSERT INTO invoice_branding (company_name, company_address, company_phone, company_email,
         company_website, invoice_footer_text, invoice_notes_default, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [data.company_name, data.company_address, data.company_phone, data.company_email,
         data.company_website, data.invoice_footer_text, data.invoice_notes_default, userId]
      );
    }
    return this.getBranding();
  }

  async uploadLogo(buffer: Buffer, originalName: string, contentType: string, userId: string) {
    const ext = path.extname(originalName).toLowerCase();
    const storagePath = `branding/logo${ext}`;
    await uploadFile(storagePath, buffer, contentType);

    const existing = await query('SELECT id FROM invoice_branding LIMIT 1');
    if (existing.rows.length) {
      await query('UPDATE invoice_branding SET logo_file_path = $1, updated_by = $2, updated_at = NOW() WHERE id = $3',
        [storagePath, userId, existing.rows[0].id]);
    } else {
      await query('INSERT INTO invoice_branding (company_name, logo_file_path, updated_by) VALUES ($1, $2, $3)',
        ['TruckFlow', storagePath, userId]);
    }

    const signedUrl = await getSignedUrl(storagePath);
    return { logo_file_path: storagePath, logo_url: signedUrl };
  }
}
