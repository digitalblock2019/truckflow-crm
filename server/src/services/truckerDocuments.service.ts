import crypto from 'crypto';
import { query } from '../config/database';
import { AppError } from '../utils/AppError';

export class TruckerDocumentsService {
  async getChecklist(truckerId: string) {
    const types = await query('SELECT * FROM trucker_document_types ORDER BY sort_order');
    const docs = await query(
      'SELECT * FROM trucker_documents WHERE trucker_id = $1 AND is_current = TRUE', [truckerId]
    );

    const docMap = new Map(docs.rows.map((d: any) => [d.document_type_id, d]));
    return types.rows.map((t: any) => {
      const doc = docMap.get(t.id);
      return {
        type_slug: t.slug,
        type_label: t.label,
        required: t.is_required,
        uploaded: !!doc,
        file_name: doc?.file_name || null,
        uploaded_at: doc?.uploaded_at || null,
        uploaded_by: doc?.uploaded_by || null,
      };
    });
  }

  async upload(truckerId: string, typeSlug: string, fileData: any, userId: string) {
    const typeResult = await query('SELECT id FROM trucker_document_types WHERE slug = $1', [typeSlug]);
    if (!typeResult.rows.length) throw new AppError('Unknown document type', 404, 'NOT_FOUND');
    const typeId = typeResult.rows[0].id;

    // Mark existing as replaced
    await query(
      `UPDATE trucker_documents SET is_current=FALSE, replaced_at=NOW(), replaced_by=$1
       WHERE trucker_id=$2 AND document_type_id=$3 AND is_current=TRUE`,
      [userId, truckerId, typeId]
    );

    const result = await query(
      `INSERT INTO trucker_documents (trucker_id, document_type_id, file_name, file_path, file_size_bytes, mime_type, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [truckerId, typeId, fileData.file_name, fileData.file_path || `uploads/${truckerId}/${typeSlug}/${fileData.file_name}`,
       fileData.file_size_bytes, fileData.mime_type, userId]
    );

    await query(
      `INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, description)
       VALUES ($1, (SELECT role FROM users WHERE id=$1), 'upload', 'trucker_document', $2, $3)`,
      [userId, result.rows[0].id, `Uploaded ${typeSlug} for trucker ${truckerId}`]
    );

    return result.rows[0];
  }

  async download(truckerId: string, reason: string, userId: string, userRole: string, ip: string) {
    await query(
      'INSERT INTO document_downloads (trucker_id, downloaded_by, user_role, reason, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [truckerId, userId, userRole, reason, ip || null]
    );
    return { message: 'Download recorded', download_url: `placeholder://downloads/${truckerId}` };
  }

  async emailForward(truckerId: string, data: any, userId: string) {
    const linkToken = crypto.randomBytes(32).toString('hex');
    const expiryHours = data.expiry_hours || 48;
    const expiresAt = new Date(Date.now() + expiryHours * 3600000);

    const result = await query(
      `INSERT INTO document_email_forwards (trucker_id, forwarded_by, recipient_email, shipper_id, reason, link_token, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [truckerId, userId, data.recipient_email, data.shipper_id || null, data.reason, linkToken, expiresAt]
    );

    await query(
      `INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, description)
       VALUES ($1, (SELECT role FROM users WHERE id=$1), 'email_forward', 'trucker', $2, $3)`,
      [userId, truckerId, `Documents forwarded to ${data.recipient_email}`]
    );

    return result.rows[0];
  }
}
