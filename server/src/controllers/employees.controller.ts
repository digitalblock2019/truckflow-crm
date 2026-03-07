import { Request, Response } from 'express';
import { EmployeesService } from '../services/employees.service';
import { AppError } from '../utils/AppError';

const svc = new EmployeesService();

export class EmployeesController {
  async list(req: Request, res: Response) {
    const result = await svc.list({
      status: req.query.status as string,
      type: req.query.type as string,
      search: req.query.search as string,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
    });
    res.json(result);
  }

  async getById(req: Request, res: Response) {
    const result = await svc.getById(req.params.id as string, req.user!.id, req.user!.role);
    res.json(result);
  }

  async create(req: Request, res: Response) {
    if (!req.body.full_name || !req.body.employee_type) throw new AppError('Full name and employee type required', 400, 'VALIDATION_ERROR');
    const result = await svc.create(req.body, req.user!.id);
    res.status(201).json(result);
  }

  async update(req: Request, res: Response) {
    const result = await svc.update(req.params.id as string, req.body, req.user!.id);
    res.json(result);
  }

  async getBankDetails(req: Request, res: Response) {
    // Audit log the reveal
    await import('../config/database').then(db =>
      db.query(
        `INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, description)
         VALUES ($1, $2, 'bank_detail_reveal', 'employee', $3, 'Bank details viewed')`,
        [req.user!.id, req.user!.role, req.params.id as string]
      )
    );
    const result = await svc.getBankDetails(req.params.id as string);
    res.json(result);
  }

  async confirmReveal(req: Request, res: Response) {
    // Re-verify password for supervisor
    const { password } = req.body;
    if (!password) throw new AppError('Password required', 400, 'VALIDATION_ERROR');
    const db = await import('../config/database');
    const bcrypt = await import('bcryptjs');
    const user = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
    if (!user.rows.length || !user.rows[0].password_hash) throw new AppError('Cannot verify', 400, 'VALIDATION_ERROR');
    const valid = await bcrypt.default.compare(password, user.rows[0].password_hash);
    if (!valid) throw new AppError('Invalid password', 401, 'INVALID_CREDENTIALS');

    const jwt = await import('jsonwebtoken');
    const { JWT_SECRET } = await import('../middleware/auth');
    const tempToken = jwt.default.sign({ id: req.user!.id, scope: 'bank_reveal', employeeId: req.params.id as string }, JWT_SECRET, { expiresIn: '5m' });
    res.json({ reveal_token: tempToken });
  }

  async updateBankDetails(req: Request, res: Response) {
    const result = await svc.updateBankDetails(req.params.id as string, req.body, req.user!.id);
    res.json(result);
  }

  async terminate(req: Request, res: Response) {
    const result = await svc.terminate(req.params.id as string, req.body, req.user!.id);
    res.json(result);
  }

  async reinstate(req: Request, res: Response) {
    const result = await svc.reinstate(req.params.id as string, req.user!.id);
    res.json(result);
  }

  async updateCrmAccount(req: Request, res: Response) {
    const result = await svc.updateCrmAccount(req.params.id as string, req.body, req.user!.id);
    res.json(result);
  }

  async adminResetPassword(req: Request, res: Response) {
    const result = await svc.adminResetPassword(req.params.id as string, req.user!.id);
    res.json(result);
  }

  async getSalarySlips(req: Request, res: Response) {
    // Resolve "me" to actual employee ID
    const db = await import('../config/database');
    let employeeId: string;
    if (req.params.id === 'me') {
      const userRow = await db.query('SELECT employee_id FROM users WHERE id = $1', [req.user!.id]);
      if (!userRow.rows[0]?.employee_id) throw new AppError('No employee record linked', 404, 'NOT_FOUND');
      employeeId = userRow.rows[0].employee_id;
    } else {
      employeeId = req.params.id as string;
    }
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const result = await svc.getSalarySlips(employeeId, year);
    res.json(result);
  }
}
