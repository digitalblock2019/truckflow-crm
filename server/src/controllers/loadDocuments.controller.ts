import { Request, Response } from 'express';
import { LoadDocumentsService } from '../services/loadDocuments.service';
import { AppError } from '../utils/AppError';

const svc = new LoadDocumentsService();

export class LoadDocumentsController {
  async getDocuments(req: Request, res: Response) {
    const result = await svc.getDocuments(req.params.id as string);
    res.json(result);
  }

  async upload(req: Request, res: Response) {
    const file = req.file;
    if (!file) throw new AppError('file is required', 400, 'VALIDATION_ERROR');
    const result = await svc.upload(
      req.params.id as string,
      req.params.doc_type as string,
      { buffer: file.buffer, originalname: file.originalname, size: file.size, mimetype: file.mimetype },
      req.user!.id
    );
    res.status(201).json(result);
  }

  async getDownloadUrl(req: Request, res: Response) {
    const url = await svc.getDownloadUrl(req.params.id as string, req.params.doc_type as string);
    res.json({ url });
  }
}
