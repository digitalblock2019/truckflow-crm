import { Router } from 'express';
import { TruckerDocumentsController } from '../controllers/truckerDocuments.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const ctrl = new TruckerDocumentsController();

router.use(authenticate);

router.get('/:id/documents', (req, res) => ctrl.getChecklist(req, res));
router.post('/:id/documents/:type_slug', (req, res) => ctrl.upload(req, res));
router.post('/:id/documents/download', (req, res) => ctrl.download(req, res));
router.post('/:id/documents/email', (req, res) => ctrl.emailForward(req, res));

export default router;
