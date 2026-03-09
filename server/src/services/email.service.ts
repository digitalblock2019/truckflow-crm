import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || '');
const FROM_EMAIL = 'TruckFlow CRM <noreply@truckflowcrm.com>';

export class EmailService {
  async sendEmail(to: string, subject: string, html: string, attachments?: { filename: string; content: Buffer }[]) {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[EmailService] RESEND_API_KEY not set — skipping email to', to);
      return;
    }
    const payload: any = { from: FROM_EMAIL, to, subject, html };
    if (attachments?.length) {
      payload.attachments = attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
      }));
    }
    const { error } = await resend.emails.send(payload);
    if (error) {
      console.error('[EmailService] Failed to send email:', error);
      throw new Error(`Email send failed: ${error.message}`);
    }
  }

  async sendPasswordResetEmail(email: string, fullName: string, resetLink: string) {
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-family: monospace; font-size: 24px; color: #0f172a; letter-spacing: 2px;">TRUCKFLOW</h1>
        </div>
        <h2 style="color: #0f172a; font-size: 18px;">Password Reset Request</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          Hi ${fullName},
        </p>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          We received a request to reset your password. Click the button below to set a new password. This link expires in 1 hour.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetLink}" style="background: #2563eb; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Reset Password
          </a>
        </div>
        <p style="color: #94a3b8; font-size: 12px; line-height: 1.5;">
          If you didn't request this, you can safely ignore this email. Your password will remain unchanged.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 11px; text-align: center;">
          TruckFlow CRM &mdash; Operations Management Platform
        </p>
      </div>
    `;
    await this.sendEmail(email, 'Reset Your TruckFlow Password', html);
  }

  async sendWelcomeEmail(email: string, fullName: string, password: string, loginUrl: string) {
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-family: monospace; font-size: 24px; color: #0f172a; letter-spacing: 2px;">TRUCKFLOW</h1>
        </div>
        <h2 style="color: #0f172a; font-size: 18px;">Welcome to TruckFlow CRM!</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          Hi ${fullName},
        </p>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          Your CRM account has been created. Here are your login credentials:
        </p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <div style="margin-bottom: 12px;">
            <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; font-family: monospace;">Email</div>
            <div style="color: #0f172a; font-size: 14px; font-weight: 600; margin-top: 4px;">${email}</div>
          </div>
          <div>
            <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; font-family: monospace;">Password</div>
            <div style="color: #0f172a; font-size: 14px; font-weight: 600; margin-top: 4px; font-family: monospace;">${password}</div>
          </div>
        </div>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${loginUrl}" style="background: #2563eb; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Sign In to TruckFlow
          </a>
        </div>
        <p style="color: #ef4444; font-size: 13px; font-weight: 600;">
          Please change your password after your first login.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 11px; text-align: center;">
          TruckFlow CRM &mdash; Operations Management Platform
        </p>
      </div>
    `;
    await this.sendEmail(email, 'Welcome to TruckFlow CRM — Your Account Details', html);
  }

  async sendInvoiceEmail(
    email: string,
    recipientName: string,
    invoiceNumber: string,
    totalAmountCents: number,
    currency: string,
    dueDate: string,
    viewLink: string,
    _payLink?: string,
    logoUrl?: string,
    companyName?: string
  ) {
    const formattedTotal = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(totalAmountCents / 100);

    // Append time to date-only strings to prevent UTC→local timezone shift
    const dueDateObj = dueDate.length === 10 ? new Date(dueDate + 'T00:00:00') : new Date(dueDate);
    const formattedDue = dueDateObj.toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    const greeting = recipientName && recipientName !== 'Customer'
      ? `Hi ${recipientName},` : 'Hi,';

    const headerHtml = logoUrl
      ? `<div style="text-align: center; margin-bottom: 32px;">
           <img src="${logoUrl}" alt="${companyName || 'Logo'}" style="max-height: 60px; max-width: 200px; object-fit: contain;" />
         </div>`
      : `<div style="text-align: center; margin-bottom: 32px;">
           <h1 style="font-family: monospace; font-size: 24px; color: #0f172a; letter-spacing: 2px;">${companyName || 'TRUCKFLOW'}</h1>
         </div>`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
        ${headerHtml}
        <h2 style="color: #0f172a; font-size: 18px;">Invoice ${invoiceNumber}</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          ${greeting}
        </p>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          You have received a new invoice. Here are the details:
        </p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
            <div>
              <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; font-family: monospace;">Invoice Number</div>
              <div style="color: #0f172a; font-size: 14px; font-weight: 600; margin-top: 4px;">${invoiceNumber}</div>
            </div>
            <div style="text-align: right;">
              <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; font-family: monospace;">Due Date</div>
              <div style="color: #0f172a; font-size: 14px; font-weight: 600; margin-top: 4px;">${formattedDue}</div>
            </div>
          </div>
          <div>
            <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; font-family: monospace;">Total Amount</div>
            <div style="color: #0f172a; font-size: 22px; font-weight: 700; margin-top: 4px;">${formattedTotal}</div>
          </div>
        </div>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${viewLink}" style="background: #2563eb; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
            View Invoice
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 11px; text-align: center;">
          TruckFlow CRM &mdash; Operations Management Platform
        </p>
      </div>
    `;
    await this.sendEmail(email, `Invoice ${invoiceNumber} — ${formattedTotal} due ${formattedDue}`, html);
  }

  async sendInvoicePaidEmail(
    email: string,
    recipientName: string,
    invoiceNumber: string,
    formattedTotal: string,
    viewLink: string,
    logoUrl?: string,
    companyName?: string,
    audience: 'recipient' | 'team' = 'recipient',
    pdfBuffer?: Buffer
  ) {
    const greeting = recipientName ? `Hi ${recipientName},` : 'Hi,';

    const headerHtml = logoUrl
      ? `<div style="text-align: center; margin-bottom: 32px;">
           <img src="${logoUrl}" alt="${companyName || 'Logo'}" style="max-height: 60px; max-width: 200px; object-fit: contain;" />
         </div>`
      : `<div style="text-align: center; margin-bottom: 32px;">
           <h1 style="font-family: monospace; font-size: 24px; color: #0f172a; letter-spacing: 2px;">${companyName || 'TRUCKFLOW'}</h1>
         </div>`;

    const message = audience === 'recipient'
      ? `Your payment for invoice <strong>${invoiceNumber}</strong> of <strong>${formattedTotal}</strong> has been received. Thank you!`
      : `Invoice <strong>${invoiceNumber}</strong> for <strong>${formattedTotal}</strong> has been marked as paid.`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
        ${headerHtml}
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; background: #dcfce7; border-radius: 50%; width: 56px; height: 56px; line-height: 56px; font-size: 28px;">&#x2713;</div>
        </div>
        <h2 style="color: #0f172a; font-size: 18px; text-align: center;">Payment Received</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          ${greeting}
        </p>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          ${message}
        </p>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0; text-align: center;">
          <div style="color: #15803d; font-size: 11px; text-transform: uppercase; font-family: monospace; letter-spacing: 1px;">Amount Paid</div>
          <div style="color: #166534; font-size: 28px; font-weight: 700; margin-top: 8px;">${formattedTotal}</div>
          <div style="color: #16a34a; font-size: 12px; margin-top: 4px;">Invoice ${invoiceNumber}</div>
        </div>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${viewLink}" style="background: #2563eb; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
            View Invoice
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 11px; text-align: center;">
          TruckFlow CRM &mdash; Operations Management Platform
        </p>
      </div>
    `;

    const subject = audience === 'recipient'
      ? `Payment Confirmed — Invoice ${invoiceNumber}`
      : `Invoice ${invoiceNumber} Paid — ${formattedTotal}`;

    const attachments = pdfBuffer
      ? [{ filename: `${invoiceNumber}.pdf`, content: pdfBuffer }]
      : undefined;

    await this.sendEmail(email, subject, html, attachments);
  }

  async sendPasswordResetByAdmin(email: string, fullName: string, newPassword: string, loginUrl: string) {
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-family: monospace; font-size: 24px; color: #0f172a; letter-spacing: 2px;">TRUCKFLOW</h1>
        </div>
        <h2 style="color: #0f172a; font-size: 18px;">Your Password Has Been Reset</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          Hi ${fullName},
        </p>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          An administrator has reset your password. Here are your new login credentials:
        </p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <div style="margin-bottom: 12px;">
            <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; font-family: monospace;">Email</div>
            <div style="color: #0f172a; font-size: 14px; font-weight: 600; margin-top: 4px;">${email}</div>
          </div>
          <div>
            <div style="color: #94a3b8; font-size: 11px; text-transform: uppercase; font-family: monospace;">New Password</div>
            <div style="color: #0f172a; font-size: 14px; font-weight: 600; margin-top: 4px; font-family: monospace;">${newPassword}</div>
          </div>
        </div>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${loginUrl}" style="background: #2563eb; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Sign In to TruckFlow
          </a>
        </div>
        <p style="color: #ef4444; font-size: 13px; font-weight: 600;">
          Please change your password after logging in.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 11px; text-align: center;">
          TruckFlow CRM &mdash; Operations Management Platform
        </p>
      </div>
    `;
    await this.sendEmail(email, 'TruckFlow CRM — Your Password Has Been Reset', html);
  }
}
