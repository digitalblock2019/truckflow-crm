import { Request, Response } from 'express';
import { LoadsService } from '../services/loads.service';
import { AppError } from '../utils/AppError';

const svc = new LoadsService();

export class LoadsController {
  async list(req: Request, res: Response) {
    const result = await svc.list({
      status: req.query.status, trucker_id: req.query.trucker_id,
      dispatcher_id: req.query.dispatcher_id, agent_id: req.query.agent_id,
      page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 50,
    }, req.user!.id, req.user!.role);
    res.json(result);
  }

  async create(req: Request, res: Response) {
    const { trucker_id, gross_load_amount_cents, dispatcher_id } = req.body;
    if (!trucker_id || !gross_load_amount_cents || !dispatcher_id) {
      throw new AppError('trucker_id, gross_load_amount_cents, and dispatcher_id required', 400, 'VALIDATION_ERROR');
    }
    const result = await svc.create(req.body, req.user!.id);
    res.status(201).json(result);
  }

  async updateStatus(req: Request, res: Response) {
    const { status } = req.body;
    if (!status) throw new AppError('status required', 400, 'VALIDATION_ERROR');
    const result = await svc.updateStatus(req.params.id as string, status, req.user!.id);
    res.json(result);
  }

  async exclude(req: Request, res: Response) {
    const { reason } = req.body;
    if (!reason) throw new AppError('reason required', 400, 'VALIDATION_ERROR');
    const result = await svc.excludeFromCommission(req.params.id as string, reason, req.user!.id);
    res.json(result);
  }
}
