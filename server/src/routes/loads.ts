import { Router } from 'express';
import { LoadsController } from '../controllers/loads.controller';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';

const router = Router();
const ctrl = new LoadsController();

router.use(authenticate);

router.get('/', (req, res) => ctrl.list(req, res));
router.post('/', authorize('admin', 'supervisor', 'dispatcher', 'sales_and_dispatcher'), (req, res) => ctrl.create(req, res));
router.patch('/:id/status', (req, res) => ctrl.updateStatus(req, res));
router.patch('/:id/exclude', authorize('admin', 'supervisor'), (req, res) => ctrl.exclude(req, res));

export default router;
