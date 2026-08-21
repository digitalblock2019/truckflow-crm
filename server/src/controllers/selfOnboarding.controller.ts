import { Request, Response } from 'express';
import {
  sendOnboarding,
  fetchOnboarding,
  submitOnboarding,
  UploadedDocFile,
} from '../services/selfOnboarding.service';
import { AppError } from '../utils/AppError';

export class SelfOnboardingController {
  // POST /truckers/:id/send-onboarding   (JWT auth)
  async send(req: Request, res: Response) {
    const { channels, expiresInDays, customMessage } = req.body ?? {};
    if (!Array.isArray(channels) || channels.length === 0) {
      throw new AppError('channels must be a non-empty array', 400, 'VALIDATION_ERROR');
    }
    const result = await sendOnboarding(
      req.params.id as string,
      req.user!.id,
      {
        channels,
        expiresInDays: typeof expiresInDays === 'number' ? expiresInDays : 14,
        customMessage,
      }
    );
    res.status(201).json(result);
  }

  // GET /public/onboarding/:token   (NO auth)
  async fetch(req: Request, res: Response) {
    const result = await fetchOnboarding(req.params.token as string);
    res.json(result);
  }

  // POST /public/onboarding/:token/submit   (NO auth, multipart)
  //
  // multer.any() puts each uploaded file on req.files[]. The field name
  // for each file MUST be `doc:<slug>` (e.g. `doc:w9_form`) so we can match
  // it back to a document_types row without a separate index.
  async submit(req: Request, res: Response) {
    const rawFiles = Array.isArray(req.files) ? req.files : [];
    const files: UploadedDocFile[] = rawFiles
      .filter((f) => typeof f.fieldname === 'string' && f.fieldname.startsWith('doc:'))
      .map((f) => ({
        slug: f.fieldname.slice(4),
        buffer: f.buffer,
        originalName: f.originalname,
        mimeType: f.mimetype,
        sizeBytes: f.size,
      }));

    // Multipart form values arrive as strings; JSON fields we care about
    // (arrays, objects) come in as JSON-stringified in a `payload` field.
    let payload: {
      fields?: Record<string, unknown>;
      provideLater?: string[];
      signedName?: string;
    } = {};
    try {
      if (typeof req.body?.payload === 'string') {
        payload = JSON.parse(req.body.payload);
      }
    } catch {
      throw new AppError('Invalid payload JSON', 400, 'VALIDATION_ERROR');
    }

    const result = await submitOnboarding(
      req.params.token as string,
      {
        fields: payload.fields ?? {},
        provideLater: Array.isArray(payload.provideLater) ? payload.provideLater : [],
        signedName: payload.signedName ?? '',
        signedIp: req.ip ?? null,
        signedUserAgent: req.headers['user-agent'] ?? null,
      },
      files
    );
    res.status(201).json(result);
  }
}
