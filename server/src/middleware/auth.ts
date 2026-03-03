import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';

export interface AuthUser {
  id: string;
  role: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'truckflow-dev-secret-change-in-production';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('Missing or invalid Authorization header', 401, 'UNAUTHORIZED');
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser & { iat: number; exp: number };
    req.user = { id: payload.id, role: payload.role, email: payload.email };
    next();
  } catch {
    throw new AppError('Invalid or expired token', 401, 'TOKEN_EXPIRED');
  }
}

export { JWT_SECRET };
