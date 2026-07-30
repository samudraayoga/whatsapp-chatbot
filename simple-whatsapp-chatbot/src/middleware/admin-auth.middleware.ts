import type { NextFunction, Request, Response } from 'express';
import type { Permission } from '../auth/permissions.js';
import { AppError } from './error.middleware.js';
import { AdminAuthService } from '../services/admin-auth.service.js';

export const createAdminAuthMiddleware =
  (authService: AdminAuthService) =>
  async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionToken = request.cookies?.admin_session;
      const auth =
        typeof sessionToken === 'string'
          ? await authService.authenticate(sessionToken)
          : null;

      if (!auth) {
        throw new AppError(
          'Authentication is required',
          401,
          'AUTHENTICATION_REQUIRED'
        );
      }

      request.adminAuth = auth;
      next();
    } catch (error) {
      next(error);
    }
  };

export const requirePermission =
  (permission: Permission) =>
  (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.adminAuth?.permissions.includes(permission)) {
      next(
        new AppError(
          'You do not have permission to perform this action',
          403,
          'PERMISSION_DENIED',
          { permission }
        )
      );
      return;
    }

    next();
  };

export const createCsrfMiddleware =
  (authService: AdminAuthService) =>
  (request: Request, _response: Response, next: NextFunction): void => {
    const csrfHeader = request.header('X-CSRF-Token') ?? '';
    const csrfCookie =
      typeof request.cookies?.admin_csrf === 'string'
        ? request.cookies.admin_csrf
        : '';

    if (
      !request.adminAuth ||
      !csrfHeader ||
      csrfHeader !== csrfCookie ||
      !authService.verifyCsrf(request.adminAuth, csrfHeader)
    ) {
      next(new AppError('Invalid CSRF token', 403, 'CSRF_TOKEN_INVALID'));
      return;
    }

    next();
  };
