import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { InvoicesController } from '../controllers/invoices.controller';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';

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

// All other routes require auth
router.use(authenticate);

// Clients
router.get('/clients', (req, res) => ctrl.listClients(req, res));
router.post('/clients', (req, res) => ctrl.createClient(req, res));
router.patch('/clients/:id', (req, res) => ctrl.updateClient(req, res));

// Tax Rates
router.get('/tax-rates', (req, res) => ctrl.listTaxRates(req, res));
router.post('/tax-rates', authorize('admin', 'supervisor'), (req, res) => ctrl.createTaxRate(req, res));

// Invoices
router.get('/', (req, res) => ctrl.listInvoices(req, res));
router.post('/', authorize('admin', 'supervisor'), (req, res) => ctrl.createInvoice(req, res));
router.get('/:id', (req, res) => ctrl.getInvoice(req, res));
router.patch('/:id', authorize('admin', 'supervisor'), (req, res) => ctrl.updateInvoice(req, res));
router.post('/:id/send', authorize('admin', 'supervisor'), (req, res) => ctrl.sendInvoice(req, res));
router.post('/:id/mark-paid', authorize('admin', 'supervisor'), (req, res) => ctrl.markPaid(req, res));
router.post('/:id/cancel', authorize('admin', 'supervisor'), (req, res) => ctrl.cancelInvoice(req, res));
router.post('/:id/suppress-reminders', authorize('admin', 'supervisor'), (req, res) => ctrl.suppressReminders(req, res));
router.get('/:id/pdf', (req, res) => ctrl.getPdf(req, res));

// Reminder Rules
router.get('/reminder-rules', authorize('admin'), (req, res) => ctrl.listReminderRules(req, res));
router.patch('/reminder-rules/:id', authorize('admin'), (req, res) => ctrl.updateReminderRule(req, res));

// Branding
router.get('/branding', (req, res) => ctrl.getBranding(req, res));
router.put('/branding', authorize('admin'), (req, res) => ctrl.updateBranding(req, res));
router.post('/branding/logo', authorize('admin'), upload.single('logo'), (req, res) => ctrl.uploadLogo(req, res));

export default router;
