import { Router } from 'express';
import { TruckersController } from '../controllers/truckers.controller';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';

const router = Router();
const ctrl = new TruckersController();

router.use(authenticate);

router.get('/', (req, res) => ctrl.list(req, res));
router.get('/batches', (req, res) => ctrl.listBatches(req, res));
router.get('/:id', (req, res) => ctrl.getById(req, res));
router.post('/', (req, res) => ctrl.create(req, res));
router.patch('/:id', (req, res) => ctrl.update(req, res));
router.post('/import', authorize('admin', 'supervisor'), (req, res) => ctrl.bulkImport(req, res));
router.post('/bulk-delete', authorize('admin', 'supervisor'), (req, res) => ctrl.bulkDelete(req, res));
router.post('/:id/initiate-onboarding', authorize('admin', 'supervisor'), (req, res) => ctrl.initiateOnboarding(req, res));
router.delete('/:id', authorize('admin', 'supervisor'), (req, res) => ctrl.delete(req, res));

export default router;
