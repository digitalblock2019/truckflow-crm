import { Request, Response } from 'express';
import { CommunicationsService } from '../services/communications.service';

const svc = new CommunicationsService();

export class CommunicationsController {
  async list(req: Request, res: Response) {
    const result = await svc.list({
      direction: req.query.direction, status: req.query.status,
      shipper_id: req.query.shipper_id, trucker_id: req.query.trucker_id,
      page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 50,
    });
    res.json(result);
  }
}
