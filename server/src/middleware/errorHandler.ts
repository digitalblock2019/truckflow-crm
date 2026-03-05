import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Error:', err.message, err.stack);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { key: err.key, message: err.message },
    });
    return;
  }

  const statusCode = (err as any).statusCode || 500;

  res.status(statusCode).json({
    error: { key: 'INTERNAL_ERROR', message: err.message },
  });
}
