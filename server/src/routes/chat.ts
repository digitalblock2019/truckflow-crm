import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';

const router = Router();
const ctrl = new ChatController();

router.use(authenticate);

router.get('/conversations', (req, res) => ctrl.listConversations(req, res));
router.post('/conversations', (req, res) => ctrl.createConversation(req, res));
router.get('/conversations/all', authorize('admin'), (req, res) => ctrl.listAll(req, res));
router.get('/conversations/:id/messages', (req, res) => ctrl.getMessages(req, res));
router.post('/conversations/:id/messages', (req, res) => ctrl.sendMessage(req, res));
router.post('/conversations/:id/attachments', (req, res) => ctrl.uploadAttachment(req, res));
router.patch('/conversations/:id/read', (req, res) => ctrl.markRead(req, res));

export default router;
