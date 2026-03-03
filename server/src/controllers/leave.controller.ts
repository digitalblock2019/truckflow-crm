import { Request, Response } from 'express';
import { LeaveService } from '../services/leave.service';
import { AppError } from '../utils/AppError';

const svc = new LeaveService();

export class LeaveController {
  async list(req: Request, res: Response) {
    const result = await svc.list({
      status: req.query.status as string,
      employee_id: req.query.employee_id as string,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
    }, req.user!.id, req.user!.role);
    res.json(result);
  }

  async submit(req: Request, res: Response) {
    const { leave_type, start_date, end_date, reason } = req.body;
    if (!leave_type || !start_date || !end_date || !reason) throw new AppError('All fields required', 400, 'VALIDATION_ERROR');
    const result = await svc.submit(req.body, req.user!.id);
    res.status(201).json(result);
  }

  async decide(req: Request, res: Response) {
    const { decision, notes } = req.body;
    if (!decision) throw new AppError('Decision required', 400, 'VALIDATION_ERROR');
    const result = await svc.decide(req.params.id as string, decision, notes, req.user!.id);
    res.json(result);
  }
}
