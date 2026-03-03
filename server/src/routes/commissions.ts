import { Router } from 'express';
import { CommissionsController } from '../controllers/commissions.controller';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';

const router = Router();
const ctrl = new CommissionsController();

router.use(authenticate);

router.get('/', (req, res) => ctrl.list(req, res));
router.patch('/:id/status', authorize('admin', 'supervisor'), (req, res) => ctrl.updateStatus(req, res));
router.get('/summary', (req, res) => ctrl.summary(req, res));

export default router;
