import type { NextFunction, Request, Response } from 'express';
import type { AdminIdentity } from '../auth/types.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';
import { AdminAuthService } from '../services/admin-auth.service.js';
import { AuditService } from '../services/audit.service.js';

const SESSION_COOKIE = 'admin_session';
const CSRF_COOKIE = 'admin_csrf';

const publicUser = (user: AdminIdentity) => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  role: user.role,
  permissions: user.permissions
});

const baseCookieOptions = {
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/'
};

export class AdminAuthController {
  constructor(
    private readonly authService: AdminAuthService,
    private readonly auditService: AuditService
  ) {}

  login = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const body =
        request.body && typeof request.body === 'object'
          ? (request.body as Record<string, unknown>)
          : {};
      const username =
        typeof body.username === 'string'
          ? body.username.trim()
          : '';
      const password =
        typeof body.password === 'string' ? body.password : '';

      if (!username || !password || username.length > 100 || password.length > 256) {
        throw new AppError(
          'Invalid username or password',
          401,
          'INVALID_CREDENTIALS'
        );
      }

      const result = await this.authService.login(username, password);

      if (!result) {
        await this.auditService.record({
          action: 'auth.login_failed',
          resourceType: 'admin_session',
          resourceId: username,
          requestId: request.requestId,
          ipAddress: request.ip,
          userAgent: request.get('user-agent')
        });
        throw new AppError(
          'Invalid username or password',
          401,
          'INVALID_CREDENTIALS'
        );
      }

      const maxAge = result.expiresAt.getTime() - Date.now();
      response.cookie(SESSION_COOKIE, result.sessionToken, {
        ...baseCookieOptions,
        httpOnly: true,
        maxAge
      });
      response.cookie(CSRF_COOKIE, result.csrfToken, {
        ...baseCookieOptions,
        httpOnly: false,
        maxAge
      });

      await this.auditService.record({
        actorUserId: result.user.id,
        action: 'auth.login_succeeded',
        resourceType: 'admin_session',
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });

      response.json({
        data: publicUser(result.user),
        meta: {
          requestId: request.requestId,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      next(error);
    }
  };

  me = (request: Request, response: Response): void => {
    response.json({
      data: publicUser(request.adminAuth!),
      meta: {
        requestId: request.requestId,
        generatedAt: new Date().toISOString()
      }
    });
  };

  logout = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const auth = request.adminAuth!;
      await this.authService.revokeSession(auth.sessionId);
      await this.auditService.record({
        actorUserId: auth.id,
        action: 'auth.logout',
        resourceType: 'admin_session',
        resourceId: auth.sessionId,
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });

      response.clearCookie(SESSION_COOKIE, baseCookieOptions);
      response.clearCookie(CSRF_COOKIE, baseCookieOptions);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
