import { Request, Response } from 'express';
import { CommissionsService } from '../services/commissions.service';
import { AppError } from '../utils/AppError';

const svc = new CommissionsService();

export class CommissionsController {
  async list(req: Request, res: Response) {
    const result = await svc.list({
      status: req.query.status, employee_id: req.query.employee_id,
      employee_type: req.query.employee_type,
      page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 50,
    });
    res.json(result);
  }

  async updateStatus(req: Request, res: Response) {
    const { status } = req.body;
    if (!status) throw new AppError('status required', 400, 'VALIDATION_ERROR');
    const result = await svc.updateStatus(req.params.id as string, status, req.user!.id);
    res.json(result);
  }

  async summary(req: Request, res: Response) {
    const result = await svc.summary({ month: req.query.month });
    res.json(result);
  }

  async exchangeRate(_req: Request, res: Response) {
    const result = await svc.getExchangeRate();
    res.json(result);
  }
}
