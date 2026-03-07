import { Router } from 'express';
import { EmployeesController } from '../controllers/employees.controller';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';

const router = Router();
const ctrl = new EmployeesController();

router.use(authenticate);

router.get('/', (req, res) => ctrl.list(req, res));
router.post('/', authorize('admin', 'supervisor'), (req, res) => ctrl.create(req, res));
router.get('/me/salary-slips', (req, res) => ctrl.getSalarySlips({ ...req, params: { ...req.params, id: 'me' } } as any, res));
router.get('/:id', (req, res) => ctrl.getById(req, res));
router.get('/:id/salary-slips', authorize('admin', 'supervisor'), (req, res) => ctrl.getSalarySlips(req, res));
router.patch('/:id', authorize('admin', 'supervisor'), (req, res) => ctrl.update(req, res));
router.patch('/:id/crm', authorize('admin'), (req, res) => ctrl.updateCrmAccount(req, res));
router.post('/:id/reset-password', authorize('admin'), (req, res) => ctrl.adminResetPassword(req, res));
router.get('/:id/bank', authorize('admin', 'supervisor'), (req, res) => ctrl.getBankDetails(req, res));
router.post('/:id/bank/confirm-reveal', authorize('admin', 'supervisor'), (req, res) => ctrl.confirmReveal(req, res));
router.put('/:id/bank', authorize('admin', 'supervisor'), (req, res) => ctrl.updateBankDetails(req, res));
router.post('/:id/terminate', authorize('admin'), (req, res) => ctrl.terminate(req, res));
router.post('/:id/reinstate', authorize('admin'), (req, res) => ctrl.reinstate(req, res));

export default router;
