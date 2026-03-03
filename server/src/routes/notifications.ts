import { Router } from 'express';
import { NotificationsController } from '../controllers/notifications.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const ctrl = new NotificationsController();

router.use(authenticate);

router.get('/', (req, res) => ctrl.list(req, res));
router.patch('/:id/read', (req, res) => ctrl.markRead(req, res));
router.patch('/read-all', (req, res) => ctrl.markAllRead(req, res));

export default router;
