import { Request, Response } from 'express';
import { NotificationsService } from '../services/notifications.service';

const svc = new NotificationsService();

export class NotificationsController {
  async list(req: Request, res: Response) {
    const result = await svc.list(req.user!.id, {
      page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 50,
    });
    res.json(result);
  }

  async markRead(req: Request, res: Response) {
    const result = await svc.markRead(req.params.id as string, req.user!.id);
    res.json(result);
  }

  async markAllRead(req: Request, res: Response) {
    const result = await svc.markAllRead(req.user!.id);
    res.json(result);
  }
}
