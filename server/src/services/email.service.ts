import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || '');
const FROM_EMAIL = 'TruckFlow CRM <onboarding@resend.dev>';

export class EmailService {
  async sendEmail(to: string, subject: string, html: string) {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[EmailService] RESEND_API_KEY not set — skipping email to', to);
      return;
    }
    const { error } = await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
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
}
