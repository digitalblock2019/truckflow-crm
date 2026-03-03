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
}
