import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';

const router = Router();
const ctrl = new SettingsController();

router.use(authenticate);
router.use(authorize('admin'));

router.get('/', (req, res) => ctrl.getAll(req, res));
router.patch('/', (req, res) => ctrl.update(req, res));
router.patch('/threshold/:trucker_id/:agent_id', (req, res) => ctrl.updateThreshold(req, res));

export default router;
