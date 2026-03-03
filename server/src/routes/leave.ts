import { Router } from 'express';
import { LeaveController } from '../controllers/leave.controller';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';

const router = Router();
const ctrl = new LeaveController();

router.use(authenticate);

router.get('/', (req, res) => ctrl.list(req, res));
router.post('/', (req, res) => ctrl.submit(req, res));
router.patch('/:id/decision', authorize('admin', 'supervisor'), (req, res) => ctrl.decide(req, res));

export default router;
