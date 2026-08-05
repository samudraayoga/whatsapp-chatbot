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
import { AdminAiChatbotController } from '../controllers/admin-ai-chatbot.controller.js';
import { AdminAiKnowledgeController } from '../controllers/admin-ai-knowledge.controller.js';
import { AdminAiDocumentController } from '../controllers/admin-ai-document.controller.js';
import { AiRagController } from '../controllers/ai-rag.controller.js';
import { AdminAiOperationsController } from '../controllers/admin-ai-operations.controller.js';
import {
  createAdminAuthMiddleware,
  createCsrfMiddleware,
  requirePermission
} from '../middleware/admin-auth.middleware.js';
import { AdminAuthService } from '../services/admin-auth.service.js';
import { validateAdminOrigin } from '../middleware/admin-origin.middleware.js';
import {
  createTenantContextMiddleware,
  requireTenantPermission
} from '../middleware/tenant-context.middleware.js';
import { TenantContextService } from '../services/tenant-context.service.js';

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
  aiChatbotController: AdminAiChatbotController;
  aiKnowledgeController: AdminAiKnowledgeController;
  aiDocumentController: AdminAiDocumentController;
  aiRagController: AiRagController;
  aiOperationsController: AdminAiOperationsController;
  tenantContextService: TenantContextService;
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
  chatbotController,
  aiChatbotController,
  aiKnowledgeController,
  aiDocumentController,
  aiRagController,
  aiOperationsController,
  tenantContextService
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
  const resolveTenant = createTenantContextMiddleware(tenantContextService);
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
    '/api/admin/v1/ai-chatbot/handoffs',
    resolveTenant,
    requirePermission('messages.read'),
    handoffController.list
  );
  router.get(
    '/api/admin/v1/ai-chatbot/handoffs/:handoffId',
    resolveTenant,
    requirePermission('messages.read'),
    handoffController.detail
  );
  router.post(
    '/api/admin/v1/ai-chatbot/handoffs/:handoffId/assign',
    mutationRateLimiter, verifyCsrf, resolveTenant,
    requirePermission('handoffs.manage'), handoffController.assign
  );
  router.post(
    '/api/admin/v1/ai-chatbot/handoffs/:handoffId/in-progress',
    mutationRateLimiter, verifyCsrf, resolveTenant,
    requirePermission('handoffs.manage'), handoffController.markInProgress
  );
  router.post(
    '/api/admin/v1/ai-chatbot/handoffs/:handoffId/resolve',
    mutationRateLimiter, verifyCsrf, resolveTenant,
    requirePermission('handoffs.manage'), handoffController.resolve
  );
  router.post(
    '/api/admin/v1/ai-chatbot/handoffs/:handoffId/close',
    mutationRateLimiter, verifyCsrf, resolveTenant,
    requirePermission('handoffs.manage'), handoffController.close
  );
  router.get(
    '/api/admin/v1/handoffs',
    requirePermission('messages.read'),
    handoffController.list
  );
  router.get(
    '/api/admin/v1/handoffs/:handoffId',
    requirePermission('messages.read'),
    handoffController.detail
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
    '/api/admin/v1/handoffs/:handoffId/in-progress',
    mutationRateLimiter,
    verifyCsrf,
    requirePermission('handoffs.manage'),
    handoffController.markInProgress
  );
  router.post(
    '/api/admin/v1/handoffs/:handoffId/close',
    mutationRateLimiter,
    verifyCsrf,
    requirePermission('handoffs.manage'),
    handoffController.close
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
    '/api/admin/v1/chatbot/config',
    requirePermission('chatbot.manage'),
    chatbotController.getConfig
  );
  router.put(
    '/api/admin/v1/chatbot/config',
    mutationRateLimiter,
    verifyCsrf,
    requirePermission('chatbot.manage'),
    chatbotController.updateConfig
  );
  router.post(
    '/api/admin/v1/chatbot/test',
    previewRateLimiter,
    verifyCsrf,
    requirePermission('chatbot.manage'),
    chatbotController.testRules
  );
  router.get(
    '/api/admin/v1/ai-chatbot/foundation',
    resolveTenant,
    requireTenantPermission('ai.settings.read'),
    aiChatbotController.getFoundation
  );
  router.get(
    '/api/admin/v1/ai-chatbot/integration',
    resolveTenant,
    requireTenantPermission('ai.settings.read'),
    aiChatbotController.getIntegration
  );
  router.put(
    '/api/admin/v1/ai-chatbot/integration',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('ai.settings.manage'),
    aiChatbotController.updateIntegration
  );
  router.post(
    '/api/admin/v1/ai-chatbot/integration/test-connection',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('ai.settings.manage'),
    aiChatbotController.testConnection
  );
  router.post(
    '/api/admin/v1/ai-chatbot/integration/activate',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('ai.settings.manage'),
    aiChatbotController.activate
  );
  router.post(
    '/api/admin/v1/ai-chatbot/integration/deactivate',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('ai.settings.manage'),
    aiChatbotController.deactivate
  );
  router.get(
    '/api/admin/v1/ai-chatbot/prompts',
    resolveTenant,
    requireTenantPermission('ai.prompts.read'),
    aiChatbotController.listPrompts
  );
  router.post(
    '/api/admin/v1/ai-chatbot/prompts',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('ai.prompts.manage'),
    aiChatbotController.createPrompt
  );
  router.post(
    '/api/admin/v1/ai-chatbot/prompts/:promptId/approve',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('ai.prompts.approve'),
    aiChatbotController.approvePrompt
  );
  router.post(
    '/api/admin/v1/ai-chatbot/prompts/:promptId/publish',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('ai.prompts.manage'),
    aiChatbotController.publishPrompt
  );
  router.get(
    '/api/admin/v1/ai-chatbot/categories',
    resolveTenant,
    requireTenantPermission('knowledge.read'),
    aiKnowledgeController.listCategories
  );
  router.post(
    '/api/admin/v1/ai-chatbot/categories',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.categories.manage'),
    aiKnowledgeController.createCategory
  );
  router.put(
    '/api/admin/v1/ai-chatbot/categories/:categoryId',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.categories.manage'),
    aiKnowledgeController.updateCategory
  );
  router.delete(
    '/api/admin/v1/ai-chatbot/categories/:categoryId',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.categories.manage'),
    aiKnowledgeController.deleteCategory
  );
  router.get(
    '/api/admin/v1/ai-chatbot/knowledge',
    resolveTenant,
    requireTenantPermission('knowledge.read'),
    aiKnowledgeController.listKnowledge
  );
  router.post(
    '/api/admin/v1/ai-chatbot/knowledge',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.edit'),
    aiKnowledgeController.createKnowledge
  );
  router.post(
    '/api/admin/v1/ai-chatbot/knowledge/bulk-action',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.publish'),
    aiKnowledgeController.bulkAction
  );
  router.get(
    '/api/admin/v1/ai-chatbot/knowledge/:knowledgeId',
    resolveTenant,
    requireTenantPermission('knowledge.read'),
    aiKnowledgeController.getKnowledge
  );
  router.put(
    '/api/admin/v1/ai-chatbot/knowledge/:knowledgeId',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.edit'),
    aiKnowledgeController.updateKnowledge
  );
  router.delete(
    '/api/admin/v1/ai-chatbot/knowledge/:knowledgeId',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.edit'),
    aiKnowledgeController.deleteKnowledge
  );
  router.post(
    '/api/admin/v1/ai-chatbot/knowledge/:knowledgeId/submit-review',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.edit'),
    aiKnowledgeController.transition('submit_review')
  );
  router.post(
    '/api/admin/v1/ai-chatbot/knowledge/:knowledgeId/request-revision',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.review'),
    aiKnowledgeController.transition('request_revision')
  );
  router.post(
    '/api/admin/v1/ai-chatbot/knowledge/:knowledgeId/approve',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.review'),
    aiKnowledgeController.transition('approve')
  );
  router.post(
    '/api/admin/v1/ai-chatbot/knowledge/:knowledgeId/publish',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.publish'),
    aiKnowledgeController.transition('publish')
  );
  router.post(
    '/api/admin/v1/ai-chatbot/knowledge/:knowledgeId/archive',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.publish'),
    aiKnowledgeController.transition('archive')
  );
  router.post(
    '/api/admin/v1/ai-chatbot/knowledge/:knowledgeId/reindex',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.publish'),
    aiKnowledgeController.reindex
  );
  router.post(
    '/api/admin/v1/ai-chatbot/knowledge/search-test',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.read'),
    aiDocumentController.searchTest
  );
  router.post(
    '/api/admin/v1/ai-chatbot/playground/test',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('ai.playground.use'),
    aiRagController.playground
  );
  router.get(
    '/api/admin/v1/ai-chatbot/playground/test-cases',
    resolveTenant,
    requireTenantPermission('ai.evaluations.manage'),
    aiOperationsController.listTestCases
  );
  router.post(
    '/api/admin/v1/ai-chatbot/playground/test-cases',
    mutationRateLimiter, verifyCsrf, resolveTenant,
    requireTenantPermission('ai.evaluations.manage'),
    aiOperationsController.createTestCase
  );
  router.put(
    '/api/admin/v1/ai-chatbot/playground/test-cases/:testCaseId',
    mutationRateLimiter, verifyCsrf, resolveTenant,
    requireTenantPermission('ai.evaluations.manage'),
    aiOperationsController.updateTestCase
  );
  router.post(
    '/api/admin/v1/ai-chatbot/playground/test-cases/:testCaseId/run',
    mutationRateLimiter, verifyCsrf, resolveTenant,
    requireTenantPermission('ai.evaluations.manage'),
    aiOperationsController.runTestCase
  );
  router.post(
    '/api/admin/v1/ai-chatbot/playground/test-cases/run-batch',
    mutationRateLimiter, verifyCsrf, resolveTenant,
    requireTenantPermission('ai.evaluations.manage'),
    aiOperationsController.runBatch
  );
  router.get(
    '/api/admin/v1/ai-chatbot/conversations/export.csv',
    resolveTenant,
    requireTenantPermission('ai.logs.read'),
    aiOperationsController.exportConversations
  );
  router.get(
    '/api/admin/v1/ai-chatbot/conversations',
    resolveTenant,
    requireTenantPermission('ai.logs.read'),
    aiOperationsController.listConversations
  );
  router.get(
    '/api/admin/v1/ai-chatbot/conversations/:conversationId',
    resolveTenant,
    requireTenantPermission('ai.logs.read'),
    aiOperationsController.getConversation
  );
  router.get(
    '/api/admin/v1/ai-chatbot/conversations/:conversationId/messages',
    resolveTenant,
    requireTenantPermission('ai.logs.read'),
    aiOperationsController.listMessages
  );
  router.post(
    '/api/admin/v1/ai-chatbot/messages/:traceId/feedback',
    mutationRateLimiter, verifyCsrf, resolveTenant,
    requireTenantPermission('ai.feedback.manage'),
    aiOperationsController.saveFeedback
  );
  router.get(
    '/api/admin/v1/ai-chatbot/unanswered',
    resolveTenant,
    requireTenantPermission('ai.logs.read'),
    aiOperationsController.listUnanswered
  );
  router.put(
    '/api/admin/v1/ai-chatbot/unanswered/:unansweredId',
    mutationRateLimiter, verifyCsrf, resolveTenant,
    requireTenantPermission('ai.unanswered.manage'),
    aiOperationsController.updateUnanswered
  );
  router.post(
    '/api/admin/v1/ai-chatbot/unanswered/:unansweredId/create-knowledge',
    mutationRateLimiter, verifyCsrf, resolveTenant,
    requireTenantPermission('ai.unanswered.manage'),
    requireTenantPermission('knowledge.edit'),
    aiOperationsController.createKnowledge
  );
  router.post(
    '/api/admin/v1/ai-chatbot/unanswered/:unansweredId/ignore',
    mutationRateLimiter, verifyCsrf, resolveTenant,
    requireTenantPermission('ai.unanswered.manage'),
    aiOperationsController.ignoreUnanswered
  );
  router.post(
    '/api/admin/v1/ai-chatbot/unanswered/:unansweredId/resolve',
    mutationRateLimiter, verifyCsrf, resolveTenant,
    requireTenantPermission('ai.unanswered.manage'),
    aiOperationsController.resolveUnanswered
  );
  router.post(
    '/api/admin/v1/ai-chatbot/documents/upload',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.edit'),
    aiDocumentController.uploadMiddleware,
    aiDocumentController.upload
  );
  router.get(
    '/api/admin/v1/ai-chatbot/documents',
    resolveTenant,
    requireTenantPermission('knowledge.read'),
    aiDocumentController.list
  );
  router.get(
    '/api/admin/v1/ai-chatbot/documents/:documentId',
    resolveTenant,
    requireTenantPermission('knowledge.read'),
    aiDocumentController.get
  );
  router.get(
    '/api/admin/v1/ai-chatbot/documents/:documentId/preview',
    previewRateLimiter,
    resolveTenant,
    requireTenantPermission('knowledge.read'),
    aiDocumentController.preview
  );
  router.post(
    '/api/admin/v1/ai-chatbot/documents/:documentId/process',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.edit'),
    aiDocumentController.process(false)
  );
  router.post(
    '/api/admin/v1/ai-chatbot/documents/:documentId/reprocess',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.edit'),
    aiDocumentController.process(true)
  );
  router.post(
    '/api/admin/v1/ai-chatbot/documents/:documentId/archive',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.publish'),
    aiDocumentController.archive
  );
  router.delete(
    '/api/admin/v1/ai-chatbot/documents/:documentId',
    mutationRateLimiter,
    verifyCsrf,
    resolveTenant,
    requireTenantPermission('knowledge.edit'),
    aiDocumentController.delete
  );
  return router;
};
