import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { TruckerDocumentsController } from '../controllers/truckerDocuments.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const ctrl = new TruckerDocumentsController();

// Store uploads in server/uploads/<truckerId>/
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(__dirname, '../../uploads', req.params.id as string, req.params.type_slug as string);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('File type not allowed'));
  },
});

router.use(authenticate);

router.get('/:id/documents', (req, res) => ctrl.getChecklist(req, res));
router.post('/:id/documents/:type_slug', upload.single('file'), (req, res) => ctrl.upload(req, res));
router.post('/:id/documents/download', (req, res) => ctrl.download(req, res));
router.post('/:id/documents/email', (req, res) => ctrl.emailForward(req, res));

export default router;
