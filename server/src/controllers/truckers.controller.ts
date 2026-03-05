import { Request, Response } from 'express';
import { TruckersService } from '../services/truckers.service';
import { AppError } from '../utils/AppError';

const svc = new TruckersService();

export class TruckersController {
  async list(req: Request, res: Response) {
    const result = await svc.list({
      status: req.query.status, assigned_to: req.query.assigned_to,
      state: req.query.state, fmcsa_status: req.query.fmcsa_status,
      search: req.query.search, batch: req.query.batch,
      page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 50,
    });
    res.json(result);
  }

  async getById(req: Request, res: Response) {
    const result = await svc.getById(req.params.id as string);
    res.json(result);
  }

  async create(req: Request, res: Response) {
    if (!req.body.mc_number || !req.body.legal_name) throw new AppError('MC number and legal name required', 400, 'VALIDATION_ERROR');
    const result = await svc.create(req.body, req.user!.id);
    res.status(201).json(result);
  }

  async update(req: Request, res: Response) {
    const result = await svc.update(req.params.id as string, req.body, req.user!.id);
    res.json(result);
  }

  async bulkImport(req: Request, res: Response) {
    if (!req.body.rows || !Array.isArray(req.body.rows)) throw new AppError('rows array required', 400, 'VALIDATION_ERROR');
    const result = await svc.bulkImport(req.body.rows, req.user!.id);
    res.status(201).json(result);
  }

  async initiateOnboarding(req: Request, res: Response) {
    const result = await svc.initiateOnboarding(req.params.id as string, req.user!.id);
    res.json(result);
  }

  async delete(req: Request, res: Response) {
    const result = await svc.delete(req.params.id as string, req.user!.id);
    res.json(result);
  }
}
