import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { AppError } from '../utils/AppError';

const authService = new AuthService();

export class AuthController {
  async login(req: Request, res: Response) {
    const { email, password } = req.body;
    if (!email || !password) throw new AppError('Email and password required', 400, 'VALIDATION_ERROR');
    const result = await authService.login(email, password);
    res.json(result);
  }

  async refresh(req: Request, res: Response) {
    const { refresh_token } = req.body;
    if (!refresh_token) throw new AppError('Refresh token required', 400, 'VALIDATION_ERROR');
    const result = await authService.refresh(refresh_token);
    res.json(result);
  }

  async logout(req: Request, res: Response) {
    const { refresh_token } = req.body;
    if (!refresh_token) throw new AppError('Refresh token required', 400, 'VALIDATION_ERROR');
    await authService.logout(refresh_token);
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
