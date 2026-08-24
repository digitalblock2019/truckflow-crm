import { PoolClient } from 'pg';
import { randomBytes, createHash } from 'crypto';
import path from 'path';
import pool, { query } from '../config/database';
import { AppError } from '../utils/AppError';
import { uploadFile } from '../config/storage';
import { EmailService } from './email.service';
import { NotificationsService } from './notifications.service';

const emailService = new EmailService();
const notificationsService = new NotificationsService();

const SELF_ONBOARDING_CHAT_GROUP_NAME = 'Self Onboarding Requests';

// -----------------------------------------------------------------------------
// Token helpers — same pattern as StaffSense device keys.
// SHA-256 for O(1) DB lookup on high-entropy random secrets.
// -----------------------------------------------------------------------------
function generateToken(): string {
  return randomBytes(36).toString('base64url'); // 288 bits
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

// "12th Sep 2026" — matches client formatOrdinalDate. Duplicated here rather
// than pulled from client/lib because the server has no path alias into it
// and this is the only server-side date formatter we need.
function formatOrdinalDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  const day = date.getDate();
  const mod100 = day % 100;
  let suffix: string;
  if (mod100 >= 11 && mod100 <= 13) suffix = 'th';
  else switch (day % 10) {
    case 1:  suffix = 'st'; break;
    case 2:  suffix = 'nd'; break;
    case 3:  suffix = 'rd'; break;
    default: suffix = 'th';
  }
  const month = date.toLocaleString('en-US', { month: 'short' });
  return `${day}${suffix} ${month} ${date.getFullYear()}`;
}

// -----------------------------------------------------------------------------
// SEND — admin/agent clicks "Send self-onboarding" on a trucker row.
// -----------------------------------------------------------------------------
export interface SendOnboardingInput {
  channels: Array<'email' | 'sms'>;   // Phase 1 accepts only ['email']
  expiresInDays: number;               // 7 / 14 / 30 / 0=no expiry
  customMessage?: string;
}

export interface SendOnboardingResult {
  requestId: string;
  expiresAt: string | null;
  sentTo: { email?: string; phone?: string };
  onboardingUrl: string;
}

const NO_EXPIRY_YEARS = 100;   // "no expiry" ≈ 100 years out; simpler than nullable
const DEFAULT_EXPIRY_DAYS = 14;

export async function sendOnboarding(
  truckerId: string,
  sentByUserId: string,
  input: SendOnboardingInput
): Promise<SendOnboardingResult> {
  // Phase 1: SMS is deferred. If the client sends 'sms', we silently drop it
  // rather than 400 — the UI has SMS greyed out but we want defense in depth.
  const channels = input.channels.filter((c) => c === 'email');
  if (channels.length === 0) {
    throw new AppError(
      'At least one send channel is required (email is the only channel available in Phase 1)',
      400,
      'NO_CHANNEL_SELECTED'
    );
  }

  // Fetch the trucker so we snapshot contact info at send time.
  const tRes = await query(
    `SELECT id, legal_name, email, phone, mc_number
     FROM truckers WHERE id = $1 LIMIT 1`,
    [truckerId]
  );
  if (tRes.rowCount === 0) {
    throw new AppError('Trucker not found', 404, 'TRUCKER_NOT_FOUND');
  }
  const trucker = tRes.rows[0];

  if (channels.includes('email') && !trucker.email) {
    throw new AppError('Trucker has no email on file', 400, 'EMAIL_MISSING');
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const days = input.expiresInDays > 0 ? input.expiresInDays : NO_EXPIRY_YEARS * 365;
  const expiresAt = new Date(Date.now() + days * 24 * 3600 * 1000);

  const insertRes = await query(
    `INSERT INTO trucker_onboarding_requests
       (trucker_id, token_hash, sent_via, sent_to_email, sent_to_phone,
        custom_message, expires_at, sent_by)
     VALUES ($1, $2, $3::text[], $4, $5, $6, $7, $8)
     RETURNING id, expires_at`,
    [
      truckerId,
      tokenHash,
      channels,
      trucker.email,
      trucker.phone,
      input.customMessage?.trim() || null,
      expiresAt,
      sentByUserId,
    ]
  );
  const req = insertRes.rows[0];

  const appUrl = process.env.APP_URL || 'https://www.truckflowcrm.com';
  const onboardingUrl = `${appUrl}/onboard/${rawToken}`;

  // Bump trucker status to self_onboarding_sent so it surfaces in the tab.
  // Only advance from an "early" status — don't clobber onboarded/interested.
  await query(
    `UPDATE truckers
     SET status_system = 'self_onboarding_sent'::trucker_status,
         status_custom_id = NULL,
         updated_at = NOW()
     WHERE id = $1
       AND (status_system IS NULL
            OR status_system IN ('called','sms_sent','response_picked_up',
                                 'response_no_answer','response_not_in_use',
                                 'self_onboarding_expired'))`,
    [truckerId]
  );

  // Fire the email. Failures shouldn't roll back the DB row — the admin
  // can resend from the UI if needed and we still have the audit trail.
  if (channels.includes('email')) {
    try {
      await sendOnboardingEmail({
        to: trucker.email as string,
        legalName: trucker.legal_name as string,
        onboardingUrl,
        customMessage: input.customMessage,
        expiresAt: req.expires_at,
      });
    } catch (err) {
      console.error('[selfOnboarding] email send failed:', err);
    }
  }

  return {
    requestId: req.id,
    expiresAt: req.expires_at,
    sentTo: { email: trucker.email ?? undefined, phone: trucker.phone ?? undefined },
    onboardingUrl,
  };
}

async function sendOnboardingEmail(params: {
  to: string;
  legalName: string;
  onboardingUrl: string;
  customMessage?: string;
  expiresAt: string | Date;
}): Promise<void> {
  const expiresLabel = formatOrdinalDate(params.expiresAt);

  const customBlock = params.customMessage?.trim()
    ? `<p style="color: #475569; font-size: 14px; line-height: 1.6; background: #f8fafc; padding: 16px; border-left: 3px solid #2563eb; border-radius: 4px;">${escapeHtml(params.customMessage.trim())}</p>`
    : '';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-family: monospace; font-size: 24px; color: #0f172a; letter-spacing: 2px;">TRUCKFLOW</h1>
      </div>
      <h2 style="color: #0f172a; font-size: 18px;">Complete your carrier onboarding</h2>
      <p style="color: #475569; font-size: 14px; line-height: 1.6;">
        Hi ${escapeHtml(params.legalName)} team,
      </p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6;">
        Please use the secure link below to complete your onboarding. You'll fill in your
        company details, contact info, equipment specs, and upload the required
        documents (MC Authority Letter, W-9, Certificate of Insurance,
        Carrier Agreement). If a document isn't ready, you can mark it
        "provide later" and submit it separately.
      </p>
      ${customBlock}
      <div style="text-align: center; margin: 32px 0;">
        <a href="${params.onboardingUrl}" style="background: #2563eb; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
          Complete Onboarding
        </a>
      </div>
      <p style="color: #94a3b8; font-size: 12px; line-height: 1.5;">
        This link expires on ${expiresLabel} and can only be submitted once.
        If you have questions, reply to this email to reach your assigned agent.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 11px; text-align: center;">
        TruckFlow CRM · Carrier Management
      </p>
    </div>
  `;
  await emailService.sendEmail(params.to, 'Complete your TruckFlow carrier onboarding', html);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// -----------------------------------------------------------------------------
// FETCH — public GET /public/onboarding/:token
// -----------------------------------------------------------------------------
export interface OnboardingFetchResult {
  request: {
    id: string;
    expiresAt: string;
    customMessage: string | null;
    submittedAlready: boolean;
  };
  trucker: {
    id: string;
    legal_name: string;
    dba_name: string | null;
    mc_number: string | null;
    dot_number: string | null;
    entity_type: string | null;
    owner_driver_name: string | null;
    email: string | null;
    phone: string | null;
    physical_address: string | null;
    city: string | null;
    state: string | null;
    truck_types: string[] | null;
    truck_length_ft: string | null;
    truck_width_ft: string | null;
    truck_height_ft: string | null;
    max_payload_lbs: number | null;
    operation_type: string | null;
    preferred_lanes: unknown;
    operating_states: string[] | null;
    avoid_states: string[] | null;
    preferred_days: string[] | null;
  };
  documentTypes: Array<{
    id: string;
    slug: string;
    label: string;
    is_required: boolean;
    is_conditional: boolean;
    condition_flag: string | null;
    is_optional: boolean;
  }>;
}

/**
 * Resolves a token to a request + trucker snapshot. Also marks the request
 * as 'opened' the first time it's fetched (so the dashboard can show that
 * the trucker actually clicked the link).
 *
 * Throws user-friendly AppErrors for invalid / expired / revoked / already-
 * submitted states so the public form page can render the right message.
 */
export async function fetchOnboarding(rawToken: string): Promise<OnboardingFetchResult> {
  const tokenHash = hashToken(rawToken);

  const reqRes = await query(
    `SELECT id, trucker_id, expires_at, status, custom_message, opened_at, submitted_at
     FROM trucker_onboarding_requests
     WHERE token_hash = $1
     LIMIT 1`,
    [tokenHash]
  );
  if (reqRes.rowCount === 0) {
    throw new AppError('This onboarding link is invalid', 404, 'INVALID_TOKEN');
  }
  const req = reqRes.rows[0];

  if (req.status === 'revoked') {
    throw new AppError('This onboarding link has been revoked. Please contact your agent.', 410, 'TOKEN_REVOKED');
  }
  if (req.status === 'submitted') {
    // Not an error per se — the form page shows a "thanks, already submitted"
    // state. We still return trucker data so it can display who submitted.
    // The `submittedAlready` flag on the response tells the client.
  } else {
    if (new Date(req.expires_at) < new Date()) {
      // Mark expired eagerly so dashboards / cron jobs see the correct state.
      await query(
        `UPDATE trucker_onboarding_requests SET status = 'expired' WHERE id = $1 AND status = 'sent'`,
        [req.id]
      );
      throw new AppError('This onboarding link has expired. Please contact your agent.', 410, 'TOKEN_EXPIRED');
    }
  }

  // First-time-open bookkeeping.
  if (!req.opened_at && req.status === 'sent') {
    await query(
      `UPDATE trucker_onboarding_requests
       SET status = 'opened', opened_at = NOW()
       WHERE id = $1`,
      [req.id]
    );
  }

  const tRes = await query(
    `SELECT id, legal_name, dba_name, mc_number, dot_number, entity_type,
            owner_driver_name, email, phone,
            physical_address, city, state,
            truck_types, truck_length_ft, truck_width_ft, truck_height_ft,
            max_payload_lbs, operation_type, preferred_lanes,
            operating_states, avoid_states, preferred_days
     FROM truckers WHERE id = $1 LIMIT 1`,
    [req.trucker_id]
  );
  if (tRes.rowCount === 0) {
    throw new AppError('Associated carrier record no longer exists', 404, 'TRUCKER_NOT_FOUND');
  }

  const docTypesRes = await query(
    `SELECT id, slug, label, is_required, is_conditional, condition_flag, is_optional
     FROM trucker_document_types
     ORDER BY sort_order ASC`
  );

  return {
    request: {
      id: req.id,
      expiresAt: req.expires_at,
      customMessage: req.custom_message,
      submittedAlready: req.status === 'submitted',
    },
    trucker: tRes.rows[0],
    documentTypes: docTypesRes.rows,
  };
}

// -----------------------------------------------------------------------------
// SUBMIT — public POST /public/onboarding/:token/submit (multipart)
// -----------------------------------------------------------------------------
export interface SubmitOnboardingInput {
  // Editable trucker fields (see fetchOnboarding for the pre-fillable set)
  fields: Record<string, unknown>;

  // For each doc type slug: either the trucker uploaded a file (in files[])
  // or checked "provide later" (present in provideLater[]).
  provideLater: string[];       // e.g. ['w9_form','void_cheque']

  // E-signature — required
  signedName: string;

  // Client info captured for legal record
  signedIp: string | null;
  signedUserAgent: string | null;
}

export interface UploadedDocFile {
  slug: string;                  // matches trucker_document_types.slug
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

const EDITABLE_FIELDS = new Set([
  'dba_name', 'dot_number', 'entity_type',
  'owner_driver_name', 'email', 'phone',
  'physical_address', 'city', 'state',
  'truck_types', 'truck_length_ft', 'truck_width_ft', 'truck_height_ft',
  'max_payload_lbs', 'operation_type', 'preferred_lanes',
  'operating_states', 'avoid_states', 'preferred_days',
  'notes',
  // MC# is editable only for prospect rows (mc_number IS NULL); enforced below.
  'mc_number',
]);

/**
 * The critical write path. Runs in a transaction so a mid-submission failure
 * leaves neither trucker updates nor document rows partially applied.
 *
 *   1. Validate token (re-check expiry — could have expired between GET and POST).
 *   2. Dedupe MC# for prospect rows (mc_number IS NULL).
 *   3. Update trucker fields.
 *   4. Upload files to Supabase Storage + insert trucker_documents rows.
 *   5. Insert trucker_pending_docs rows for "provide later" doc types.
 *   6. Mark request submitted + status_system = self_onboarding_submitted.
 *   7. Insert status history + audit log rows.
 *   8. Fire notifications (in-app + email + chat) — outside the txn so a
 *      notification failure doesn't undo the submit.
 */
export async function submitOnboarding(
  rawToken: string,
  input: SubmitOnboardingInput,
  files: UploadedDocFile[]
): Promise<{ truckerId: string; requestId: string; docsUploaded: number; docsDeferred: number }> {
  const tokenHash = hashToken(rawToken);

  if (!input.signedName?.trim()) {
    throw new AppError('E-signature (typed name) is required', 400, 'SIGNATURE_REQUIRED');
  }

  const client: PoolClient = await pool.connect();
  let truckerId: string;
  let requestId: string;
  let docsUploaded = 0;
  let docsDeferred = 0;
  let dupeOfTruckerId: string | null = null;

  try {
    await client.query('BEGIN');

    // Lock the request row so a double-submit (browser back button, refresh)
    // can't both succeed.
    const reqRes = await client.query(
      `SELECT id, trucker_id, expires_at, status
       FROM trucker_onboarding_requests
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );
    if (reqRes.rowCount === 0) {
      throw new AppError('This onboarding link is invalid', 404, 'INVALID_TOKEN');
    }
    const req = reqRes.rows[0];
    requestId = req.id;
    truckerId = req.trucker_id;

    if (req.status === 'submitted') {
      throw new AppError('This onboarding form has already been submitted', 409, 'ALREADY_SUBMITTED');
    }
    if (req.status === 'revoked') {
      throw new AppError('This onboarding link has been revoked', 410, 'TOKEN_REVOKED');
    }
    if (new Date(req.expires_at) < new Date()) {
      await client.query(
        `UPDATE trucker_onboarding_requests SET status = 'expired' WHERE id = $1`,
        [req.id]
      );
      throw new AppError('This onboarding link has expired', 410, 'TOKEN_EXPIRED');
    }

    // Load current trucker for MC# dedupe.
    const tRes = await client.query(
      `SELECT id, mc_number FROM truckers WHERE id = $1 FOR UPDATE`,
      [truckerId]
    );
    if (tRes.rowCount === 0) {
      throw new AppError('Associated carrier record no longer exists', 404, 'TRUCKER_NOT_FOUND');
    }
    const currentMc = tRes.rows[0].mc_number as string | null;
    const submittedMc = typeof input.fields.mc_number === 'string'
      ? input.fields.mc_number.trim() || null
      : null;

    if (currentMc === null && submittedMc) {
      // Prospect + trucker filled MC# — check for collision against real records.
      const dupeRes = await client.query(
        `SELECT id FROM truckers WHERE mc_number = $1 AND id <> $2 LIMIT 1`,
        [submittedMc, truckerId]
      );
      if ((dupeRes.rowCount ?? 0) > 0) {
        dupeOfTruckerId = dupeRes.rows[0].id;
        // Don't merge or auto-delete — mark this prospect and reject with
        // a friendly error. Agent gets the notification separately.
        await client.query(
          `UPDATE truckers
           SET duplicate_of_trucker_id = $2,
               status_system = 'duplicate_of'::trucker_status,
               status_custom_id = NULL,
               updated_at = NOW()
           WHERE id = $1`,
          [truckerId, dupeOfTruckerId]
        );
        await client.query(
          `UPDATE trucker_onboarding_requests
           SET status = 'revoked', revoked_at = NOW()
           WHERE id = $1`,
          [requestId]
        );
        await client.query('COMMIT');
        throw new AppError(
          `MC# ${submittedMc} already exists in our system. Please contact your assigned agent.`,
          409,
          'MC_ALREADY_EXISTS'
        );
      }
    }

    // Build the trucker UPDATE dynamically from the allow-list.
    const sets: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (const [key, value] of Object.entries(input.fields)) {
      if (!EDITABLE_FIELDS.has(key)) continue;
      // For mc_number: only allow update if current is NULL.
      if (key === 'mc_number' && currentMc !== null) continue;
      sets.push(`${key} = $${p}`);
      params.push(value === '' ? null : value);
      p += 1;
    }
    if (sets.length > 0) {
      params.push(truckerId);
      await client.query(
        `UPDATE truckers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${p}`,
        params
      );
    }

    // Files → storage + rows. `uploaded_by` requires a users.id (NOT NULL);
    // we use the request's sent_by as the effective actor, since the trucker
    // has no user account. That agent's ID also shows up in the audit log.
    const sentByRes = await client.query(
      `SELECT sent_by FROM trucker_onboarding_requests WHERE id = $1`,
      [requestId]
    );
    const sentByUserId = sentByRes.rows[0].sent_by as string;

    for (const file of files) {
      const typeRes = await client.query(
        `SELECT id FROM trucker_document_types WHERE slug = $1`,
        [file.slug]
      );
      if (typeRes.rowCount === 0) continue; // unknown slug — silently skip
      const typeId = typeRes.rows[0].id;

      const ext = path.extname(file.originalName);
      const storagePath = `${truckerId}/${file.slug}/${Date.now()}${ext}`;

      // Storage uploads happen inside the txn — if this throws, ROLLBACK
      // reverts row changes but leaves the object in Storage. Acceptable for
      // Phase 1; a cleanup job or resend flow will overwrite next time.
      await uploadFile(storagePath, file.buffer, file.mimeType);

      // Mark any existing current doc of this type as replaced.
      await client.query(
        `UPDATE trucker_documents
         SET is_current = FALSE, replaced_at = NOW(), replaced_by = $1
         WHERE trucker_id = $2 AND document_type_id = $3 AND is_current = TRUE`,
        [sentByUserId, truckerId, typeId]
      );

      await client.query(
        `INSERT INTO trucker_documents
           (trucker_id, document_type_id, file_name, file_path,
            file_size_bytes, mime_type, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [truckerId, typeId, file.originalName, storagePath,
         file.sizeBytes, file.mimeType, sentByUserId]
      );
      docsUploaded += 1;

      // If a pending_docs row existed for this type, mark it resolved.
      await client.query(
        `UPDATE trucker_pending_docs
         SET resolved_at = NOW()
         WHERE trucker_id = $1 AND document_type_id = $2 AND resolved_at IS NULL`,
        [truckerId, typeId]
      );
    }

    // "Provide later" → pending rows.
    for (const slug of input.provideLater) {
      const typeRes = await client.query(
        `SELECT id FROM trucker_document_types WHERE slug = $1`,
        [slug]
      );
      if (typeRes.rowCount === 0) continue;
      const typeId = typeRes.rows[0].id;
      await client.query(
        `INSERT INTO trucker_pending_docs (trucker_id, document_type_id, requested_via)
         VALUES ($1, $2, 'self_onboarding')
         ON CONFLICT (trucker_id, document_type_id) DO UPDATE
           SET requested_at = NOW(), resolved_at = NULL`,
        [truckerId, typeId]
      );
      docsDeferred += 1;
    }

    // Close out the request + advance status.
    await client.query(
      `UPDATE trucker_onboarding_requests
       SET status = 'submitted',
           submitted_at = NOW(),
           signed_name = $2,
           signed_ip = $3::inet,
           signed_user_agent = $4
       WHERE id = $1`,
      [requestId, input.signedName.trim(), input.signedIp, input.signedUserAgent]
    );

    await client.query(
      `UPDATE truckers
       SET status_system = 'self_onboarding_submitted'::trucker_status,
           status_custom_id = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [truckerId]
    );

    // Status history — audit-facing.
    await client.query(
      `INSERT INTO trucker_status_history
         (trucker_id, old_status_system, new_status_system, changed_by, comment)
       SELECT id, status_system, 'self_onboarding_submitted'::trucker_status, $2,
              'Submitted via self-onboarding link'
       FROM truckers WHERE id = $1`,
      [truckerId, sentByUserId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Notifications happen after the txn commits. Failures here are logged
  // but don't roll back — the trucker's submission is durable.
  fireSubmissionNotifications({
    truckerId: truckerId!,
    docsUploaded,
    docsDeferred,
  }).catch((err) => console.error('[selfOnboarding] notify failed:', err));

  return { truckerId: truckerId!, requestId: requestId!, docsUploaded, docsDeferred };
}

// -----------------------------------------------------------------------------
// NOTIFICATIONS on submit — 3 channels
// -----------------------------------------------------------------------------
async function fireSubmissionNotifications(params: {
  truckerId: string;
  docsUploaded: number;
  docsDeferred: number;
}): Promise<void> {
  // Load trucker + assigned agent + admins.
  //
  // Agent email comes from users.email (via employees.crm_user_id) because
  // employees.personal_email is optional and only the CRM login address is
  // guaranteed to reach the person. Falls back to personal_email if the
  // employee isn't a CRM user (crm_user_id IS NULL).
  const tRes = await query(
    `SELECT t.id, t.legal_name, t.mc_number, t.phone, t.email,
            t.assigned_sales_agent_id,
            COALESCE(u.email, e.personal_email) AS agent_email,
            e.full_name AS agent_name
     FROM truckers t
     LEFT JOIN employees e ON e.id = t.assigned_sales_agent_id
     LEFT JOIN users     u ON u.id = e.crm_user_id
     WHERE t.id = $1`,
    [params.truckerId]
  );
  if (tRes.rowCount === 0) return;
  const t = tRes.rows[0];

  const usersRes = await query(
    `SELECT id, email, role FROM users WHERE is_active = TRUE`
  );
  const allUsers = usersRes.rows as Array<{ id: string; email: string; role: string }>;
  const admins = allUsers.filter((u) => u.role === 'admin');

  const total = params.docsUploaded + params.docsDeferred;
  const title = `Onboarding submitted: ${t.legal_name}`;
  const body = `MC# ${t.mc_number ?? 'not provided'} · Docs uploaded ${params.docsUploaded}/${total}`;

  // ---- 1. In-app to entire team ----
  await notificationsService.createForMultiple(
    allUsers.map((u) => u.id),
    title,
    body,
    'trucker',
    params.truckerId
  );

  // ---- 2. Email to assigned agent + all admins ----
  const emailRecipients = new Set<string>();
  if (t.agent_email) emailRecipients.add(t.agent_email);
  for (const a of admins) if (a.email) emailRecipients.add(a.email);

  const appUrl = process.env.APP_URL || 'https://www.truckflowcrm.com';
  const truckerLink = `${appUrl}/truckers/${t.id}`;
  const emailHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #0f172a; font-size: 18px;">${escapeHtml(t.legal_name)} completed self-onboarding</h2>
      <p style="color: #475569; font-size: 14px;">
        MC#: <strong>${escapeHtml(t.mc_number ?? 'not provided')}</strong><br/>
        Phone: ${escapeHtml(t.phone ?? 'not provided')}<br/>
        Email: ${escapeHtml(t.email ?? 'not provided')}<br/>
        Documents uploaded: <strong>${params.docsUploaded}</strong> of ${total}
        ${params.docsDeferred > 0 ? `(${params.docsDeferred} marked "provide later")` : ''}
      </p>
      <p><a href="${truckerLink}" style="background: #2563eb; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Open trucker record</a></p>
    </div>
  `;
  for (const to of emailRecipients) {
    emailService.sendEmail(to, `Self-onboarding submitted: ${t.legal_name}`, emailHtml)
      .catch((e) => console.error('[selfOnboarding] email notify failed for', to, e));
  }

  // ---- 3. Chat group post ----
  // Written as an is_system=TRUE message so the UI renders it centered/pill
  // (same convention as "X added Y" system messages). Skips chat.sendMessage
  // deliberately — that path enforces membership, and we want the post to
  // land even if the request's sent_by admin has left the group.
  const groupRes = await query(
    `SELECT id, created_by FROM chat_conversations
     WHERE type = 'group' AND name = $1 LIMIT 1`,
    [SELF_ONBOARDING_CHAT_GROUP_NAME]
  );
  if ((groupRes.rowCount ?? 0) > 0) {
    const groupId = groupRes.rows[0].id as string;
    const senderId = groupRes.rows[0].created_by as string;   // guaranteed users.id and member
    const chatContent = `🚛 ${t.legal_name} submitted their self-onboarding form. ` +
      `MC# ${t.mc_number ?? 'not provided'}, phone ${t.phone ?? 'not provided'}. ` +
      `Docs uploaded: ${params.docsUploaded}/${total}.`;
    try {
      await query(
        `INSERT INTO chat_messages (conversation_id, sender_id, content, is_system)
         VALUES ($1, $2, $3, TRUE)`,
        [groupId, senderId, chatContent]
      );
      await query(
        `UPDATE chat_conversations
         SET updated_at = NOW(), last_message_at = NOW(), last_message_preview = $2
         WHERE id = $1`,
        [groupId, chatContent.substring(0, 100)]
      );
    } catch (err) {
      console.error('[selfOnboarding] chat post failed:', err);
    }
  }
}
