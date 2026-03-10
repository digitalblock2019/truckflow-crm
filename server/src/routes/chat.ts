import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';

const router = Router();
const ctrl = new ChatController();

router.use(authenticate);

// Conversations
router.get('/conversations', (req, res) => ctrl.listConversations(req, res));
router.post('/conversations', (req, res) => ctrl.createConversation(req, res));
router.get('/conversations/search', (req, res) => ctrl.searchConversations(req, res));
router.get('/conversations/all', authorize('admin'), (req, res) => ctrl.listAll(req, res));
router.get('/conversations/all/:id/messages', authorize('admin'), (req, res) => ctrl.getAdminMessages(req, res));

// Single conversation
router.patch('/conversations/:id', (req, res) => ctrl.updateConversation(req, res));
router.delete('/conversations/:id', (req, res) => ctrl.deleteConversation(req, res));
router.patch('/conversations/:id/pin', (req, res) => ctrl.togglePin(req, res));
router.patch('/conversations/:id/read', (req, res) => ctrl.markRead(req, res));

// Members
router.get('/conversations/:id/members', (req, res) => ctrl.getConversationMembers(req, res));
router.post('/conversations/:id/members', (req, res) => ctrl.addMembers(req, res));
router.delete('/conversations/:id/members/:userId', (req, res) => ctrl.removeMember(req, res));
router.patch('/conversations/:id/members/:userId/promote', (req, res) => ctrl.promoteMember(req, res));

// Messages
router.get('/conversations/:id/messages', (req, res) => ctrl.getMessages(req, res));
router.post('/conversations/:id/messages', (req, res) => ctrl.sendMessage(req, res));
router.patch('/conversations/:id/messages/:msgId', (req, res) => ctrl.editMessage(req, res));
router.delete('/conversations/:id/messages/:msgId', (req, res) => ctrl.deleteMessage(req, res));

// Reactions
router.post('/conversations/:id/messages/:msgId/reactions', (req, res) => ctrl.addReaction(req, res));
router.delete('/conversations/:id/messages/:msgId/reactions/:emoji', (req, res) => ctrl.removeReaction(req, res));

// Attachments
router.post('/conversations/:id/attachments', (req, res) => ctrl.uploadAttachment(req, res));

// Presence
router.get('/presence', (req, res) => ctrl.getPresence(req, res));

// Users (for chat user picker)
router.get('/users', (req, res) => ctrl.listUsers(req, res));

export default router;
