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
}
