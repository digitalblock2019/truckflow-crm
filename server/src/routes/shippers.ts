import { Router } from 'express';
import { ShippersController } from '../controllers/shippers.controller';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';

const router = Router();
const ctrl = new ShippersController();

router.use(authenticate);

router.get('/', (req, res) => ctrl.list(req, res));
router.post('/', (req, res) => ctrl.create(req, res));
router.patch('/:id', (req, res) => ctrl.update(req, res));
router.delete('/:id', authorize('admin', 'supervisor'), (req, res) => ctrl.delete(req, res));

export default router;
