import { Router, Request, Response } from 'express';
import { DashboardService } from '../services/dashboard.service';

const router = Router();
const dashboardService = new DashboardService();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const stats = await dashboardService.getStats();
    res.json(stats);
  } catch (err: any) {
    console.error('Dashboard stats error:', err.message);
    res.status(500).json({ message: 'Failed to load dashboard stats' });
  }
});

export default router;
