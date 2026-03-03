import { Router } from 'express';
import { CommunicationsController } from '../controllers/communications.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const ctrl = new CommunicationsController();

router.use(authenticate);
router.get('/', (req, res) => ctrl.list(req, res));

export default router;
