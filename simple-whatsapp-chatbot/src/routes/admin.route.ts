import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AdminAuthController } from '../controllers/admin-auth.controller.js';
import { AdminOverviewController } from '../controllers/admin-overview.controller.js';
import { AdminSafetyController } from '../controllers/admin-safety.controller.js';
import { AdminSessionController } from '../controllers/admin-session.controller.js';
import { AdminReadController } from '../controllers/admin-read.controller.js';
import { AdminHandoffController } from '../controllers/admin-handoff.controller.js';
import {
  createAdminAuthMiddleware,
  createCsrfMiddleware,
  requirePermission
} from '../middleware/admin-auth.middleware.js';
import { AdminAuthService } from '../services/admin-auth.service.js';

type CreateAdminRouterDeps = {
  authService: AdminAuthService;
  authController: AdminAuthController;
  overviewController: AdminOverviewController;
  sessionController: AdminSessionController;
  safetyController: AdminSafetyController;
  readController: AdminReadController;
  handoffController: AdminHandoffController;
};

export const createAdminRouter = ({
  authService,
  authController,
  overviewController,
  sessionController,
  safetyController,
  readController,
  handoffController
}: CreateAdminRouterDeps): Router => {
  const router = Router();
  const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (request, response) => {
      response.status(429).json({
        error: {
          code: 'LOGIN_RATE_LIMITED',
          message: 'Too many login attempts. Try again later.',
          requestId: request.requestId
        }
      });
    }
  });
  const authenticate = createAdminAuthMiddleware(authService);
  const verifyCsrf = createCsrfMiddleware(authService);
  const mutationRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (request, response) => {
      response.status(429).json({
        error: {
          code: 'OPERATION_RATE_LIMITED',
          message: 'Too many operational requests. Try again shortly.',
          requestId: request.requestId
        }
      });
    }
  });

  router.post(
    '/api/admin/v1/auth/login',
    loginRateLimiter,
    authController.login
  );

  router.use('/api/admin/v1', authenticate);
  router.get('/api/admin/v1/me', authController.me);
  router.post(
    '/api/admin/v1/auth/logout',
    verifyCsrf,
    authController.logout
  );
  router.get(
    '/api/admin/v1/overview',
    requirePermission('dashboard.read'),
    overviewController.getOverview
  );
  router.get(
    '/api/admin/v1/session',
    requirePermission('dashboard.read'),
    sessionController.getSession
  );
  router.get(
    '/api/admin/v1/session/qr',
    requirePermission('session.reconnect'),
    sessionController.getQr
  );
  router.post(
    '/api/admin/v1/session/reconnect',
    mutationRateLimiter,
    verifyCsrf,
    requirePermission('session.reconnect'),
    sessionController.reconnect
  );
  router.post(
    '/api/admin/v1/safety/pause',
    mutationRateLimiter,
    verifyCsrf,
    requirePermission('safety.pause'),
    safetyController.pause
  );
  router.get(
    '/api/admin/v1/safety/stats',
    requirePermission('dashboard.read'),
    safetyController.getStats
  );
  router.get(
    '/api/admin/v1/events/stream',
    requirePermission('dashboard.read'),
    sessionController.events
  );
  router.get(
    '/api/admin/v1/conversations',
    requirePermission('messages.read'),
    readController.listConversations
  );
  router.get(
    '/api/admin/v1/conversations/:conversationId/messages',
    requirePermission('contacts.read'),
    requirePermission('messages.read'),
    readController.listMessages
  );
  router.get(
    '/api/admin/v1/contacts',
    requirePermission('contacts.read'),
    readController.listContacts
  );
  router.get(
    '/api/admin/v1/contacts/:contactId',
    requirePermission('contacts.read'),
    readController.getContact
  );
  router.get(
    '/api/admin/v1/handoffs',
    requirePermission('messages.read'),
    handoffController.list
  );
  router.post(
    '/api/admin/v1/handoffs/:handoffId/assign',
    mutationRateLimiter,
    verifyCsrf,
    requirePermission('handoffs.manage'),
    handoffController.assign
  );
  router.post(
    '/api/admin/v1/handoffs/:handoffId/resolve',
    mutationRateLimiter,
    verifyCsrf,
    requirePermission('handoffs.manage'),
    handoffController.resolve
  );

  return router;
};
