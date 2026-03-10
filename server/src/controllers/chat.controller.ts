import { Request, Response } from 'express';
import { ChatService } from '../services/chat.service';
import { AppError } from '../utils/AppError';

const svc = new ChatService();

export class ChatController {
  async listConversations(req: Request, res: Response) {
    const result = await svc.listConversations(req.user!.id);
    res.json(result);
  }

  async createConversation(req: Request, res: Response) {
    const { type } = req.body;
    if (!type) throw new AppError('type required', 400, 'VALIDATION_ERROR');
    const result = await svc.createConversation(req.body, req.user!.id, req.user!.role);
    res.status(201).json(result);
  }

  async getMessages(req: Request, res: Response) {
    const result = await svc.getMessages(
      req.params.id as string, req.user!.id,
      req.query.cursor as string, Number(req.query.limit) || 50
    );
    res.json(result);
  }

  async sendMessage(req: Request, res: Response) {
    const { content, reply_to_id } = req.body;
    if (!content) throw new AppError('content required', 400, 'VALIDATION_ERROR');
    const result = await svc.sendMessage(req.params.id as string, content, req.user!.id, reply_to_id);
    res.status(201).json(result);
  }

  async editMessage(req: Request, res: Response) {
    const { content } = req.body;
    if (!content) throw new AppError('content required', 400, 'VALIDATION_ERROR');
    const result = await svc.editMessage(req.params.id as string, req.params.msgId as string, content, req.user!.id);
    res.json(result);
  }

  async deleteMessage(req: Request, res: Response) {
    const result = await svc.deleteMessage(req.params.id as string, req.params.msgId as string, req.user!.id, req.user!.role);
    res.json(result);
  }

  async addReaction(req: Request, res: Response) {
    const { emoji } = req.body;
    if (!emoji) throw new AppError('emoji required', 400, 'VALIDATION_ERROR');
    const result = await svc.addReaction(req.params.id as string, req.params.msgId as string, emoji, req.user!.id);
    res.json(result);
  }

  async removeReaction(req: Request, res: Response) {
    const result = await svc.removeReaction(req.params.id as string, req.params.msgId as string, req.params.emoji as string, req.user!.id);
    res.json(result);
  }

  async updateConversation(req: Request, res: Response) {
    const result = await svc.updateConversation(req.params.id as string, req.body, req.user!.id);
    res.json(result);
  }

  async deleteConversation(req: Request, res: Response) {
    const result = await svc.deleteConversation(req.params.id as string, req.user!.id);
    res.json(result);
  }

  async getConversationMembers(req: Request, res: Response) {
    const result = await svc.getConversationMembers(req.params.id as string, req.user!.id);
    res.json(result);
  }

  async addMembers(req: Request, res: Response) {
    const { member_ids } = req.body;
    if (!member_ids?.length) throw new AppError('member_ids required', 400, 'VALIDATION_ERROR');
    const result = await svc.addMembers(req.params.id as string, member_ids, req.user!.id);
    res.json(result);
  }

  async removeMember(req: Request, res: Response) {
    const result = await svc.removeMember(req.params.id as string, req.params.userId as string, req.user!.id);
    res.json(result);
  }

  async promoteMember(req: Request, res: Response) {
    const result = await svc.promoteMember(req.params.id as string, req.params.userId as string, req.user!.id);
    res.json(result);
  }

  async togglePin(req: Request, res: Response) {
    const result = await svc.togglePin(req.params.id as string, req.user!.id);
    res.json(result);
  }

  async searchConversations(req: Request, res: Response) {
    const q = req.query.q as string;
    if (!q) throw new AppError('q required', 400, 'VALIDATION_ERROR');
    const result = await svc.searchConversations(req.user!.id, q);
    res.json(result);
  }

  async uploadAttachment(req: Request, res: Response) {
    if (!req.body.file_name) throw new AppError('file_name required', 400, 'VALIDATION_ERROR');
    const result = await svc.uploadAttachment(req.params.id as string, req.body, req.user!.id);
    res.status(201).json(result);
  }

  async markRead(req: Request, res: Response) {
    const result = await svc.markRead(req.params.id as string, req.user!.id);
    res.json(result);
  }

  async listAll(req: Request, res: Response) {
    const result = await svc.listAllConversations();
    res.json(result);
  }

  async getAdminMessages(req: Request, res: Response) {
    const result = await svc.getMessagesForAdmin(
      req.params.id as string, req.query.cursor as string, Number(req.query.limit) || 50
    );
    res.json(result);
  }

  async getPresence(_req: Request, res: Response) {
    const result = svc.getPresence();
    res.json(result);
  }
}
