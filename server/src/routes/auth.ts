import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const ctrl = new AuthController();

router.post('/login', (req, res) => ctrl.login(req, res));
router.post('/refresh', (req, res) => ctrl.refresh(req, res));
router.post('/logout', (req, res) => ctrl.logout(req, res));
router.get('/me', authenticate, (req, res) => ctrl.me(req, res));

export default router;
