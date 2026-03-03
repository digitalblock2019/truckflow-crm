import { Router } from 'express';
import { AuditLogController } from '../controllers/auditLog.controller';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';

const router = Router();
const ctrl = new AuditLogController();

router.use(authenticate);
router.get('/', authorize('admin', 'supervisor'), (req, res) => ctrl.list(req, res));

export default router;
