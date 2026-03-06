import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../config/database';
import { AppError } from '../utils/AppError';
import { JWT_SECRET } from '../middleware/auth';

const ACCESS_TOKEN_EXPIRY = '1h';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export class AuthService {
  async login(email: string, password: string) {
    const result = await query('SELECT id, email, full_name, role, employee_id, is_active, password_hash FROM users WHERE email = $1', [email]);
    if (!result.rows.length) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

    const user = result.rows[0];
    if (!user.is_active) throw new AppError('Account disabled', 403, 'ACCOUNT_DISABLED');
    if (!user.password_hash) throw new AppError('Password not set', 401, 'INVALID_CREDENTIALS');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

    const accessToken = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 86400000);

    await query('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [user.id, refreshToken, expiresAt]);
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role }
    };
  }

  async refresh(refreshToken: string) {
    const result = await query('SELECT rt.*, u.email, u.role, u.is_active FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE rt.token = $1', [refreshToken]);
    if (!result.rows.length) throw new AppError('Invalid refresh token', 401, 'INVALID_TOKEN');

    const row = result.rows[0];
    if (new Date(row.expires_at) < new Date()) {
      await query('DELETE FROM refresh_tokens WHERE id = $1', [row.id]);
      throw new AppError('Refresh token expired', 401, 'TOKEN_EXPIRED');
    }
    if (!row.is_active) throw new AppError('Account disabled', 403, 'ACCOUNT_DISABLED');

    const accessToken = jwt.sign({ id: row.user_id, role: row.role, email: row.email }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    return { access_token: accessToken, expires_in: 3600 };
  }

  async logout(refreshToken: string) {
    await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const result = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (!result.rows.length) throw new AppError('User not found', 404, 'NOT_FOUND');

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) throw new AppError('Current password is incorrect', 401, 'INVALID_CREDENTIALS');

    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userId]);
    return { message: 'Password changed successfully' };
  }

  async requestPasswordReset(email: string) {
    const result = await query('SELECT id, full_name FROM users WHERE email = $1 AND is_active = TRUE', [email]);
    if (result.rows.length) {
      const user = result.rows[0];
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 3600000); // 1 hour
      await query('UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3', [token, expires, user.id]);

      const { EmailService } = await import('./email.service');
      const emailService = new EmailService();
      const resetLink = `${process.env.APP_URL || 'http://localhost:3001'}/reset-password?token=${token}`;
      await emailService.sendPasswordResetEmail(email, user.full_name, resetLink);
    }
    // Always return success to prevent email enumeration
    return { message: 'If that email exists, a reset link has been sent' };
  }

  async resetPassword(token: string, newPassword: string) {
    const result = await query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );
    if (!result.rows.length) throw new AppError('Invalid or expired reset token', 400, 'INVALID_TOKEN');

    const userId = result.rows[0].id;
    const hash = await bcrypt.hash(newPassword, 12);
    await query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL, updated_at = NOW() WHERE id = $2',
      [hash, userId]
    );
    // Force re-login by clearing all refresh tokens
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    return { message: 'Password reset successfully' };
  }

  async me(userId: string) {
    const result = await query(`
      SELECT u.id, u.email, u.full_name, u.role, u.employee_id, u.is_active, u.last_login_at, u.created_at,
             e.employee_number, e.job_title, e.department, e.employee_type, e.employment_status
      FROM users u
      LEFT JOIN employees e ON e.id = u.employee_id
      WHERE u.id = $1
    `, [userId]);
    if (!result.rows.length) throw new AppError('User not found', 404, 'NOT_FOUND');
    return result.rows[0];
  }
}
