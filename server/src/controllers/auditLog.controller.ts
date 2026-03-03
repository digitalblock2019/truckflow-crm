import { Request, Response } from 'express';
import { AuditLogService } from '../services/auditLog.service';

const svc = new AuditLogService();

export class AuditLogController {
  async list(req: Request, res: Response) {
    const result = await svc.list({
      action: req.query.action, entity_type: req.query.entity_type,
      entity_id: req.query.entity_id, user_id: req.query.user_id,
      from: req.query.from, to: req.query.to,
      page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 50,
    });
    res.json(result);
  }
}
