import { Request, Response } from 'express';
import { SettingsService } from '../services/settings.service';
import { AppError } from '../utils/AppError';

const svc = new SettingsService();

export class SettingsController {
  async getAll(_req: Request, res: Response) {
    const result = await svc.getAll();
    res.json(result);
  }

  async update(req: Request, res: Response) {
    if (!req.body || typeof req.body !== 'object') throw new AppError('Settings object required', 400, 'VALIDATION_ERROR');
    const result = await svc.update(req.body, req.user!.id);
    res.json(result);
  }

  async updateThreshold(req: Request, res: Response) {
    const { threshold_loads } = req.body;
    if (!threshold_loads) throw new AppError('threshold_loads required', 400, 'VALIDATION_ERROR');
    const result = await svc.updateThreshold(req.params.trucker_id as string, req.params.agent_id as string, req.body, req.user!.id);
    res.json(result);
  }
}
