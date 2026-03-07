import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { LoadDocumentsController } from '../controllers/loadDocuments.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const ctrl = new LoadDocumentsController();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('File type not allowed'));
  },
});

router.use(authenticate);

router.get('/:id/documents', (req, res) => ctrl.getDocuments(req, res));
router.post('/:id/documents/:doc_type', upload.single('file'), (req, res) => ctrl.upload(req, res));
router.get('/:id/documents/:doc_type/url', (req, res) => ctrl.getDownloadUrl(req, res));

export default router;
