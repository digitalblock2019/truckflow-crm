import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const ctrl = new AuthController();

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('File type not allowed. Use PNG, JPG, or WebP.'));
  },
});

router.post('/login', (req, res) => ctrl.login(req, res));
router.post('/refresh', (req, res) => ctrl.refresh(req, res));
router.post('/logout', (req, res) => ctrl.logout(req, res));
router.get('/me', authenticate, (req, res) => ctrl.me(req, res));
router.patch('/me', authenticate, (req, res) => ctrl.updateProfile(req, res));
router.post('/me/avatar', authenticate, avatarUpload.single('avatar'), (req, res) => ctrl.uploadAvatar(req, res));
router.post('/change-password', authenticate, (req, res) => ctrl.changePassword(req, res));
router.post('/forgot-password', (req, res) => ctrl.requestPasswordReset(req, res));
router.post('/reset-password', (req, res) => ctrl.resetPassword(req, res));

export default router;
