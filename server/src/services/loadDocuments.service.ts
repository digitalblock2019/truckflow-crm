import path from 'path';
import { query } from '../config/database';
import { uploadFile, getSignedUrl } from '../config/storage';
import { AppError } from '../utils/AppError';

const BUCKET = 'load-documents';
const VALID_TYPES = ['rate_con', 'bol', 'pod', 'receipt'];
const TYPE_LABELS: Record<string, string> = {
  rate_con: 'Rate Confirmation',
  bol: 'Bill of Lading',
  pod: 'Proof of Delivery',
  receipt: 'Receipt / Proof of Payment',
};

export class LoadDocumentsService {
  async getDocuments(loadOrderId: string) {
    const docs = await query(
      'SELECT * FROM load_documents WHERE load_order_id = $1',
      [loadOrderId]
    );
    const docMap = new Map(docs.rows.map((d: any) => [d.doc_type, d]));

    return VALID_TYPES.map((type) => {
      const doc = docMap.get(type);
      return {
        doc_type: type,
        label: TYPE_LABELS[type],
        uploaded: !!doc,
        file_name: doc?.file_name || null,
        file_size_bytes: doc?.file_size_bytes || null,
        mime_type: doc?.mime_type || null,
        uploaded_by: doc?.uploaded_by || null,
        uploaded_at: doc?.uploaded_at || null,
      };
    });
  }

  async upload(
    loadOrderId: string,
    docType: string,
    file: { buffer: Buffer; originalname: string; size: number; mimetype: string },
    userId: string
  ) {
    if (!VALID_TYPES.includes(docType)) {
      throw new AppError(`Invalid doc_type. Must be one of: ${VALID_TYPES.join(', ')}`, 400, 'VALIDATION_ERROR');
    }

    // Verify load exists
    const load = await query('SELECT id FROM load_orders WHERE id = $1', [loadOrderId]);
    if (!load.rows.length) throw new AppError('Load not found', 404, 'NOT_FOUND');

    const ext = path.extname(file.originalname);
    const storagePath = `${loadOrderId}/${docType}/${Date.now()}${ext}`;

    await uploadFile(storagePath, file.buffer, file.mimetype, BUCKET);

    // Upsert — delete existing then insert (handles UNIQUE constraint)
    await query(
      'DELETE FROM load_documents WHERE load_order_id = $1 AND doc_type = $2',
      [loadOrderId, docType]
    );

    const result = await query(
      `INSERT INTO load_documents (load_order_id, doc_type, file_name, file_path, file_size_bytes, mime_type, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [loadOrderId, docType, file.originalname, storagePath, file.size, file.mimetype, userId]
    );

    await query(
      `INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, description)
       VALUES ($1, (SELECT role FROM users WHERE id=$1), 'upload', 'load_document', $2, $3)`,
      [userId, result.rows[0].id, `Uploaded ${docType} for load ${loadOrderId}`]
    );

    return result.rows[0];
  }

  async getDownloadUrl(loadOrderId: string, docType: string): Promise<string> {
    const result = await query(
      'SELECT file_path FROM load_documents WHERE load_order_id = $1 AND doc_type = $2',
      [loadOrderId, docType]
    );
    if (!result.rows.length) {
      throw new AppError('Document not found', 404, 'NOT_FOUND');
    }
    return getSignedUrl(result.rows[0].file_path, 3600, BUCKET);
  }
}
