import { Request, Response } from 'express';
import { ShippersService } from '../services/shippers.service';
import { AppError } from '../utils/AppError';

const svc = new ShippersService();

export class ShippersController {
  async list(req: Request, res: Response) {
    const result = await svc.list({
      search: req.query.search, is_active: req.query.is_active,
      page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 50,
    });
    res.json(result);
  }

  async create(req: Request, res: Response) {
    if (!req.body.company_name || !req.body.email) throw new AppError('company_name and email required', 400, 'VALIDATION_ERROR');
    const result = await svc.create(req.body, req.user!.id);
    res.status(201).json(result);
  }

  async update(req: Request, res: Response) {
    const result = await svc.update(req.params.id as string, req.body);
    res.json(result);
  }

  async delete(req: Request, res: Response) {
    const result = await svc.delete(req.params.id as string);
    res.json(result);
  }
}
