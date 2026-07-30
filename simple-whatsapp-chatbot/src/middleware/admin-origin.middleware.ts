import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { AppError } from './error.middleware.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export const validateAdminOrigin = (
  request: Request,
  _response: Response,
  next: NextFunction
): void => {
  if (safeMethods.has(request.method)) {
    next();
    return;
  }

  const origin = request.get('origin');
  if (!origin) {
    next();
    return;
  }

  const host = request.get('host');
  const sameOrigin = host ? `${request.protocol}://${host}` : null;
  if (
    origin === sameOrigin ||
    env.ADMIN_ALLOWED_ORIGINS.includes(origin)
  ) {
    next();
    return;
  }

  next(
    new AppError(
      'Request origin is not allowed',
      403,
      'ORIGIN_NOT_ALLOWED'
    )
  );
};
