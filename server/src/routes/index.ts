import { Router, Request, Response } from 'express';
import { query } from '../config/database';

import authRouter from './auth';
import employeesRouter from './employees';
import leaveRouter from './leave';
import truckersRouter from './truckers';
import truckerDocumentsRouter from './truckerDocuments';
import shippersRouter from './shippers';
import loadsRouter from './loads';
import loadDocumentsRouter from './loadDocuments';
import commissionsRouter from './commissions';
import communicationsRouter from './communications';
import chatRouter from './chat';
import invoicesRouter from './invoices';
import notificationsRouter from './notifications';
import auditLogRouter from './auditLog';
import settingsRouter from './settings';
import { authenticate } from '../middleware/auth';
import { CommissionsService } from '../services/commissions.service';

const router = Router();

// Health check (public)
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT count(*) AS count
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'`
    );
    res.json({ status: 'ok', tables: Number(result.rows[0].count) });
  } catch (err: any) {
    console.error('Health check DB error:', err.message);
    res.status(500).json({
      status: 'error',
      message: err.message,
      dbUrlSet: !!process.env.DATABASE_URL,
      dbUrlPrefix: process.env.DATABASE_URL?.substring(0, 30) + '...',
    });
  }
});

// Module routes
router.use('/auth', authRouter);
router.use('/employees', employeesRouter);
router.use('/leave', leaveRouter);
router.use('/truckers', truckersRouter);
router.use('/truckers', truckerDocumentsRouter);
router.use('/shippers', shippersRouter);
router.use('/loads', loadsRouter);
router.use('/loads', loadDocumentsRouter);
router.use('/commissions', commissionsRouter);
router.use('/communications', communicationsRouter);
router.use('/chat', chatRouter);
router.use('/invoice', invoicesRouter);
router.use('/notifications', notificationsRouter);
router.use('/audit-log', auditLogRouter);
router.use('/settings', settingsRouter);

// Exchange rate (standalone endpoint)
const commSvc = new CommissionsService();
router.get('/exchange-rate/current', authenticate, async (_req: Request, res: Response) => {
  const result = await commSvc.getExchangeRate();
  res.json(result);
});

export default router;
