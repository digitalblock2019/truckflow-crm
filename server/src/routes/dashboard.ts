import { Router, Request, Response } from 'express';
import { DashboardService } from '../services/dashboard.service';
import { query } from '../config/database';

const router = Router();
const dashboardService = new DashboardService();

router.get('/', async (req: Request, res: Response) => {
  try {
    const role = req.user!.role;
    const isPrivileged = role === 'admin' || role === 'supervisor';

    let scoped = false;
    let employeeId: string | undefined;
    if (!isPrivileged) {
      scoped = true;
      const empRow = await query('SELECT employee_id FROM users WHERE id = $1', [req.user!.id]);
      employeeId = empRow.rows[0]?.employee_id ?? undefined;
    }

    const stats = await dashboardService.getStats({ scoped, employeeId });
    res.json(stats);
  } catch (err: any) {
    console.error('Dashboard stats error:', err.message);
    res.status(500).json({ message: 'Failed to load dashboard stats' });
  }
});

export default router;
