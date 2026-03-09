import { Request, Response } from 'express';
import { CommissionsService } from '../services/commissions.service';
import { query } from '../config/database';
import { AppError } from '../utils/AppError';

const svc = new CommissionsService();

export class CommissionsController {
  async list(req: Request, res: Response) {
    const role = req.user!.role;
    const isPrivileged = role === 'admin' || role === 'supervisor';

    // Non-admin/supervisor users can only see their own commissions
    let employeeId = req.query.employee_id as string | undefined;
    if (!isPrivileged) {
      const empRow = await query('SELECT employee_id FROM users WHERE id = $1', [req.user!.id]);
      employeeId = empRow.rows[0]?.employee_id;
      if (!employeeId) {
        res.json({ data: [], total: 0, page: 1, limit: 50, summary: { total_usd_cents: 0, total_pkr_paisa: 0 } });
        return;
      }
    }

    const result = await svc.list({
      status: req.query.status, employee_id: employeeId,
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
    const role = req.user!.role;
    const isPrivileged = role === 'admin' || role === 'supervisor';

    let employeeId: string | undefined;
    if (!isPrivileged) {
      const empRow = await query('SELECT employee_id FROM users WHERE id = $1', [req.user!.id]);
      employeeId = empRow.rows[0]?.employee_id;
      if (!employeeId) { res.json([]); return; }
    }

    const result = await svc.summary({ month: req.query.month, employee_id: employeeId });
    res.json(result);
  }

  async exchangeRate(_req: Request, res: Response) {
    const result = await svc.getExchangeRate();
    res.json(result);
  }
}
