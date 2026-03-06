import { Request, Response } from 'express';
import { TruckerDocumentsService } from '../services/truckerDocuments.service';
import { AppError } from '../utils/AppError';

const svc = new TruckerDocumentsService();

export class TruckerDocumentsController {
  async getChecklist(req: Request, res: Response) {
    const result = await svc.getChecklist(req.params.id as string);
    res.json(result);
  }

  async upload(req: Request, res: Response) {
    const file = req.file;
    if (!file) throw new AppError('file is required', 400, 'VALIDATION_ERROR');
    const fileData = {
      file_name: file.originalname,
      file_path: file.path,
      file_size_bytes: file.size,
      mime_type: file.mimetype,
    };
    const result = await svc.upload(req.params.id as string, req.params.type_slug as string, fileData, req.user!.id);
    res.status(201).json(result);
  }

  async download(req: Request, res: Response) {
    const { reason } = req.body;
    if (!reason) throw new AppError('reason required', 400, 'VALIDATION_ERROR');
    const result = await svc.download(req.params.id as string, reason, req.user!.id, req.user!.role, req.ip || '');
    res.json(result);
  }

  async emailForward(req: Request, res: Response) {
    const { recipient_email, reason } = req.body;
    if (!recipient_email || !reason) throw new AppError('recipient_email and reason required', 400, 'VALIDATION_ERROR');
    const result = await svc.emailForward(req.params.id as string, req.body, req.user!.id);
    res.status(201).json(result);
  }
}
