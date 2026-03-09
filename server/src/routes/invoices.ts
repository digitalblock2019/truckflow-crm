import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import express from 'express';
import { InvoicesController } from '../controllers/invoices.controller';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { getStripeInstance } from '../config/stripe';
import { query } from '../config/database';

const router = Router();
const ctrl = new InvoicesController();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('File type not allowed. Use PNG, JPG, SVG, or WebP.'));
  },
});

// Public endpoint (no auth)
router.get('/view/:view_token', (req, res) => ctrl.viewByToken(req, res));

// Stripe webhook (public, needs raw body)
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  const stripe = getStripeInstance();
  if (!stripe) { res.status(400).json({ error: 'Stripe not configured' }); return; }

  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) { res.status(400).json({ error: 'Webhook secret not configured' }); return; }

  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const invoiceNumber = session.metadata?.invoice_number;
      if (invoiceNumber) {
        const existing = await query('SELECT * FROM invoices WHERE invoice_number=$1 AND status != \'paid\'', [invoiceNumber]);
        if (existing.rows.length) {
          const invoice = existing.rows[0];
          await query(
            `UPDATE invoices SET status='paid', paid_at=NOW(), payment_reference=$1, updated_at=NOW()
             WHERE id=$2`,
            [`stripe:${session.id}`, invoice.id]
          );
          await query(
            `INSERT INTO invoice_activity (invoice_id, event_type, description)
             VALUES ($1, 'paid_stripe', 'Payment received via Stripe')`,
            [invoice.id]
          );

          // Send paid notification emails
          try {
            const { InvoicesService } = await import('../services/invoices.service');
            const { EmailService } = await import('../services/email.service');
            const invoiceSvc = new InvoicesService();
            const emailService = new EmailService();
            const branding = await invoiceSvc.getBranding();
            const appUrl = process.env.APP_URL || 'https://www.truckflowcrm.com';
            const viewLink = `${appUrl}/invoice-view/${invoice.view_token}`;
            const formattedTotal = new Intl.NumberFormat('en-US', {
              style: 'currency', currency: invoice.currency || 'USD',
            }).format(invoice.total_amount / 100);

            if (invoice.recipient_email) {
              await emailService.sendInvoicePaidEmail(
                invoice.recipient_email, invoice.recipient_name || '',
                invoice.invoice_number, formattedTotal, viewLink,
                branding?.logo_url, branding?.company_name, 'recipient'
              );
            }
            const team = await query(
              `SELECT DISTINCT u.email, u.full_name FROM users u
               WHERE u.is_active = TRUE AND (u.role IN ('admin', 'supervisor') OR u.id = $1)`,
              [invoice.created_by]
            );
            for (const m of team.rows) {
              await emailService.sendInvoicePaidEmail(
                m.email, m.full_name, invoice.invoice_number, formattedTotal,
                viewLink, branding?.logo_url, branding?.company_name, 'team'
              );
            }
          } catch (emailErr) {
            console.error('[Stripe Webhook] Paid notification emails failed:', emailErr);
          }
        }
      }
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error('[Stripe Webhook] Error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// All other routes require auth
router.use(authenticate);

// Clients
router.get('/clients', (req, res) => ctrl.listClients(req, res));
router.post('/clients', (req, res) => ctrl.createClient(req, res));
router.patch('/clients/:id', (req, res) => ctrl.updateClient(req, res));

// Tax Rates
router.get('/tax-rates', (req, res) => ctrl.listTaxRates(req, res));
router.post('/tax-rates', authorize('admin', 'supervisor'), (req, res) => ctrl.createTaxRate(req, res));

// Branding (must be before /:id to avoid matching "branding" as uuid)
router.get('/branding', (req, res) => ctrl.getBranding(req, res));
router.put('/branding', authorize('admin'), (req, res) => ctrl.updateBranding(req, res));
router.post('/branding/logo', authorize('admin'), upload.single('logo'), (req, res) => ctrl.uploadLogo(req, res));

// Reminder Rules
router.get('/reminder-rules', authorize('admin'), (req, res) => ctrl.listReminderRules(req, res));
router.patch('/reminder-rules/:id', authorize('admin'), (req, res) => ctrl.updateReminderRule(req, res));

// Invoices
router.get('/', (req, res) => ctrl.listInvoices(req, res));
router.post('/', authorize('admin', 'supervisor', 'dispatcher', 'sales_and_dispatcher'), (req, res) => ctrl.createInvoice(req, res));
router.get('/:id', (req, res) => ctrl.getInvoice(req, res));
router.patch('/:id', authorize('admin', 'supervisor', 'dispatcher', 'sales_and_dispatcher'), (req, res) => ctrl.updateInvoice(req, res));
router.post('/:id/send', authorize('admin', 'supervisor', 'dispatcher', 'sales_and_dispatcher'), (req, res) => ctrl.sendInvoice(req, res));
router.post('/:id/mark-paid', authorize('admin', 'supervisor', 'dispatcher', 'sales_and_dispatcher'), (req, res) => ctrl.markPaid(req, res));
router.post('/:id/cancel', authorize('admin', 'supervisor', 'dispatcher', 'sales_and_dispatcher'), (req, res) => ctrl.cancelInvoice(req, res));
router.post('/:id/suppress-reminders', authorize('admin', 'supervisor', 'dispatcher', 'sales_and_dispatcher'), (req, res) => ctrl.suppressReminders(req, res));
router.get('/:id/pdf', (req, res) => ctrl.getPdf(req, res));

export default router;
