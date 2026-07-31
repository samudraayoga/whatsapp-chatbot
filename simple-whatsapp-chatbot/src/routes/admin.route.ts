import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AdminAuthController } from '../controllers/admin-auth.controller.js';
import { AdminOverviewController } from '../controllers/admin-overview.controller.js';
import { AdminSafetyController } from '../controllers/admin-safety.controller.js';
import { AdminSessionController } from '../controllers/admin-session.controller.js';
import { AdminReadController } from '../controllers/admin-read.controller.js';
import { AdminHandoffController } from '../controllers/admin-handoff.controller.js';
import { AdminMessageController } from '../controllers/admin-message.controller.js';
import { AdminChatbotController } from '../controllers/admin-chatbot.controller.js';
import {
  createAdminAuthMiddleware,
  createCsrfMiddleware,
  requirePermission
} from '../middleware/admin-auth.middleware.js';
import { AdminAuthService } from '../services/admin-auth.service.js';
import { validateAdminOrigin } from '../middleware/admin-origin.middleware.js';

type CreateAdminRouterDeps = {
  authService: AdminAuthService;
  authController: AdminAuthController;
  overviewController: AdminOverviewController;
  sessionController: AdminSessionController;
  safetyController: AdminSafetyController;
  readController: AdminReadController;
  handoffController: AdminHandoffController;
  messageController: AdminMessageController;
  chatbotController: AdminChatbotController;
};

export const createAdminRouter = ({
  authService,
  authController,
  overviewController,
  sessionController,
  safetyController,
  readController,
  handoffController,
  messageController,
  chatbotController
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
    keyGenerator: (request) =>
      request.adminAuth?.id ?? 'unauthenticated-admin',
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
  const previewRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (request) =>
      request.adminAuth?.id ?? 'unauthenticated-admin'
  });

  router.use('/api/admin/v1', validateAdminOrigin);
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
    '/api/admin/v1/session/reset',
    mutationRateLimiter,
    verifyCsrf,
    requirePermission('session.reset'),
    sessionController.resetCredentials
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
    '/api/admin/v1/safety/metrics',
    requirePermission('dashboard.read'),
    safetyController.metrics
  );
  router.post(
    '/api/admin/v1/safety/resume',
    mutationRateLimiter,
    verifyCsrf,
    requirePermission('safety.resume'),
    safetyController.resume
  );
  router.post(
    '/api/admin/v1/safety/reset',
    mutationRateLimiter,
    verifyCsrf,
    requirePermission('session.reset'),
    safetyController.reset
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
  router.post(
    '/api/admin/v1/messages',
    mutationRateLimiter,
    verifyCsrf,
    requirePermission('messages.send'),
    messageController.create
  );
  router.get(
    '/api/admin/v1/messages/:messageId',
    requirePermission('messages.read'),
    messageController.get
  );
  router.get(
    '/api/admin/v1/outbox',
    requirePermission('messages.read'),
    messageController.listOutbox
  );
  router.post(
    '/api/admin/v1/outbox/:outboxId/cancel',
    mutationRateLimiter,
    verifyCsrf,
    requirePermission('messages.cancel'),
    messageController.cancel
  );
  router.post(
    '/api/admin/v1/outbox/:outboxId/retry',
    mutationRateLimiter,
    verifyCsrf,
    requirePermission('messages.send'),
    messageController.retry
  );
  router.post(
    '/api/admin/v1/outbox/:outboxId/reconcile',
    mutationRateLimiter,
    verifyCsrf,
    requirePermission('messages.send'),
    messageController.reconcile
  );
  router.get(
    '/api/admin/v1/chatbot/versions',
    requirePermission('chatbot.manage'),
    chatbotController.listVersions
  );
  router.get(
    '/api/admin/v1/chatbot/versions/:versionId',
    requirePermission('chatbot.manage'),
    chatbotController.getVersion
  );
  router.post(
    '/api/admin/v1/chatbot/versions/drafts',
    mutationRateLimiter,
    verifyCsrf,
    requirePermission('chatbot.manage'),
    chatbotController.createDraft
  );
  router.put(
    '/api/admin/v1/chatbot/versions/:versionId/rules',
    mutationRateLimiter,
    verifyCsrf,
    requirePermission('chatbot.manage'),
    chatbotController.replaceRules
  );
  router.post(
    '/api/admin/v1/chatbot/test',
    previewRateLimiter,
    verifyCsrf,
    requirePermission('chatbot.manage'),
    chatbotController.testRules
  );
  router.post(
    '/api/admin/v1/chatbot/versions/:versionId/publish',
    mutationRateLimiter,
    verifyCsrf,
    requirePermission('chatbot.manage'),
    chatbotController.publish
  );
  router.post(
    '/api/admin/v1/chatbot/versions/:versionId/rollback',
    mutationRateLimiter,
    verifyCsrf,
    requirePermission('chatbot.manage'),
    chatbotController.rollback
  );

  return router;
};
