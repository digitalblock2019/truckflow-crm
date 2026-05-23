import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { AppError } from '../utils/AppError';
import { query } from '../config/database';

const authService = new AuthService();

// Best-effort audit-log writer for auth events. Failures are logged but
// must never block the auth flow.
async function recordAuthEvent(
  action: 'login' | 'logout',
  userId: string | null,
  userRole: string | null,
  description: string,
  ip: string | null,
  userAgent: string | null,
) {
  try {
    await query(
      `INSERT INTO audit_log (user_id, user_role, action, entity_type, entity_id, description, ip_address, user_agent)
       VALUES ($1, $2, $3, 'user', $1, $4, $5::inet, $6)`,
      [userId, userRole, action, description, ip, userAgent],
    );
  } catch (err: any) {
    console.error('[Auth audit] failed to record event:', err?.message);
  }
}

export class AuthController {
  async login(req: Request, res: Response) {
    const { email, password } = req.body;
    const ip = req.ip || null;
    const ua = (req.headers['user-agent'] as string | undefined) || null;
    if (!email || !password) throw new AppError('Email and password required', 400, 'VALIDATION_ERROR');
    try {
      const result = await authService.login(email, password);
      await recordAuthEvent('login', result.user.id, result.user.role, 'Logged in', ip, ua);
      res.json(result);
    } catch (err) {
      // Attach failed-login audits to the user when the email matches an
      // account, so brute-force against a specific account is visible.
      const lookup = await query('SELECT id, role FROM users WHERE email = $1', [email]);
      const uid = lookup.rows[0]?.id ?? null;
      const role = lookup.rows[0]?.role ?? null;
      await recordAuthEvent('login', uid, role, `Failed login: ${email}`, ip, ua);
      throw err;
    }
  }

  async refresh(req: Request, res: Response) {
    const { refresh_token } = req.body;
    if (!refresh_token) throw new AppError('Refresh token required', 400, 'VALIDATION_ERROR');
    const result = await authService.refresh(refresh_token);
    res.json(result);
  }

  async logout(req: Request, res: Response) {
    const { refresh_token } = req.body;
    const ip = req.ip || null;
    const ua = (req.headers['user-agent'] as string | undefined) || null;
    if (!refresh_token) throw new AppError('Refresh token required', 400, 'VALIDATION_ERROR');
    // Resolve the user before the refresh token is deleted so we can attribute the audit row.
    const lookup = await query(
      'SELECT u.id, u.role FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE rt.token = $1',
      [refresh_token],
    );
    const uid = lookup.rows[0]?.id ?? null;
    const role = lookup.rows[0]?.role ?? null;
    await authService.logout(refresh_token);
    await recordAuthEvent('logout', uid, role, 'Logged out', ip, ua);
    res.json({ message: 'Logged out' });
  }

  async me(req: Request, res: Response) {
    const result = await authService.me(req.user!.id);
    res.json(result);
  }

  async updateProfile(req: Request, res: Response) {
    const { full_name } = req.body;
    if (!full_name) throw new AppError('Full name is required', 400, 'VALIDATION_ERROR');
    const result = await authService.updateProfile(req.user!.id, { full_name });
    res.json(result);
  }

  async changePassword(req: Request, res: Response) {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) throw new AppError('Current and new password required', 400, 'VALIDATION_ERROR');
    if (new_password.length < 8) throw new AppError('New password must be at least 8 characters', 400, 'VALIDATION_ERROR');
    const result = await authService.changePassword(req.user!.id, current_password, new_password);
    res.json(result);
  }

  async requestPasswordReset(req: Request, res: Response) {
    const { email } = req.body;
    if (!email) throw new AppError('Email required', 400, 'VALIDATION_ERROR');
    const result = await authService.requestPasswordReset(email);
    res.json(result);
  }

  async resetPassword(req: Request, res: Response) {
    const { token, new_password } = req.body;
    if (!token || !new_password) throw new AppError('Token and new password required', 400, 'VALIDATION_ERROR');
    if (new_password.length < 8) throw new AppError('Password must be at least 8 characters', 400, 'VALIDATION_ERROR');
    const result = await authService.resetPassword(token, new_password);
    res.json(result);
  }

  async uploadAvatar(req: Request, res: Response) {
    if (!req.file) throw new AppError('Avatar file required', 400, 'VALIDATION_ERROR');
    const result = await authService.uploadAvatar(req.user!.id, req.file.buffer, req.file.originalname, req.file.mimetype);
    res.json(result);
  }
}
