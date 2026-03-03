import { Request, Response } from 'express';
import { InvoicesService } from '../services/invoices.service';
import { AppError } from '../utils/AppError';

const svc = new InvoicesService();

export class InvoicesController {
  // Clients
  async listClients(req: Request, res: Response) {
    const result = await svc.listClients({ search: req.query.search, page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 50 });
    res.json(result);
  }
  async createClient(req: Request, res: Response) {
    if (!req.body.company_name || !req.body.email) throw new AppError('company_name and email required', 400, 'VALIDATION_ERROR');
    res.status(201).json(await svc.createClient(req.body, req.user!.id));
  }
  async updateClient(req: Request, res: Response) { res.json(await svc.updateClient(req.params.id as string, req.body)); }

  // Tax Rates
  async listTaxRates(_req: Request, res: Response) { res.json(await svc.listTaxRates()); }
  async createTaxRate(req: Request, res: Response) {
    if (!req.body.name || req.body.rate === undefined) throw new AppError('name and rate required', 400, 'VALIDATION_ERROR');
    res.status(201).json(await svc.createTaxRate(req.body, req.user!.id));
  }

  // Invoices
  async listInvoices(req: Request, res: Response) {
    res.json(await svc.listInvoices({ status: req.query.status, client_id: req.query.client_id, page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 50 }));
  }
  async createInvoice(req: Request, res: Response) {
    if (!req.body.recipient_email || !req.body.due_date) throw new AppError('recipient_email and due_date required', 400, 'VALIDATION_ERROR');
    res.status(201).json(await svc.createInvoice(req.body, req.user!.id));
  }
  async getInvoice(req: Request, res: Response) { res.json(await svc.getInvoice(req.params.id as string)); }
  async updateInvoice(req: Request, res: Response) { res.json(await svc.updateInvoice(req.params.id as string, req.body, req.user!.id)); }
  async sendInvoice(req: Request, res: Response) { res.json(await svc.sendInvoice(req.params.id as string, req.user!.id)); }
  async markPaid(req: Request, res: Response) { res.json(await svc.markPaid(req.params.id as string, req.body, req.user!.id)); }
  async cancelInvoice(req: Request, res: Response) {
    res.json(await svc.cancelInvoice(req.params.id as string, req.body.reason || '', req.user!.id));
  }
  async suppressReminders(req: Request, res: Response) { res.json(await svc.suppressReminders(req.params.id as string, req.user!.id)); }
  async getPdf(req: Request, res: Response) { res.json(await svc.getInvoicePdf(req.params.id as string)); }
  async viewByToken(req: Request, res: Response) { res.json(await svc.viewByToken(req.params.view_token as string)); }

  // Reminder Rules
  async listReminderRules(_req: Request, res: Response) { res.json(await svc.listReminderRules()); }
  async updateReminderRule(req: Request, res: Response) { res.json(await svc.updateReminderRule(req.params.id as string, req.body)); }

  // Branding
  async getBranding(_req: Request, res: Response) { res.json(await svc.getBranding()); }
  async updateBranding(req: Request, res: Response) { res.json(await svc.updateBranding(req.body, req.user!.id)); }
  async uploadLogo(req: Request, res: Response) {
    if (!req.body.file_path) throw new AppError('file_path required', 400, 'VALIDATION_ERROR');
    res.json(await svc.uploadLogo(req.body.file_path, req.user!.id));
  }
}
