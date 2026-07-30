import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { errorMiddleware } from './middleware/error.middleware.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { createHealthRouter } from './routes/health.route.js';
import { createAdminRouter } from './routes/admin.route.js';
import { createMessageRouter } from './routes/message.route.js';
import { createWhatsAppRouter } from './routes/whatsapp.route.js';
import { MessageController } from './controllers/message.controller.js';
import { MessageService } from './services/message.service.js';
import { WhatsAppService } from './services/whatsapp.service.js';
import { AdminAuthService } from './services/admin-auth.service.js';
import { AuditService } from './services/audit.service.js';
import { OverviewService } from './services/overview.service.js';
import { AdminAuthController } from './controllers/admin-auth.controller.js';
import { AdminOverviewController } from './controllers/admin-overview.controller.js';
import { AdminSessionController } from './controllers/admin-session.controller.js';
import { AdminSafetyController } from './controllers/admin-safety.controller.js';
import { OperationalEventService } from './services/operational-event.service.js';
import { ReadModelService } from './services/read-model.service.js';
import { AdminReadController } from './controllers/admin-read.controller.js';
import { HandoffService } from './services/handoff.service.js';
import { AdminHandoffController } from './controllers/admin-handoff.controller.js';
import { env } from './config/env.js';

type CreateAppDeps = {
  whatsappService: WhatsAppService;
  messageService: MessageService;
  databaseHealthCheck?: () => Promise<boolean>;
  adminAuthService?: AdminAuthService;
  auditService?: AuditService;
  overviewService?: OverviewService;
  operationalEventService?: OperationalEventService;
  readModelService?: ReadModelService;
  handoffService?: HandoffService;
};

export const createApp = ({
  whatsappService,
  messageService,
  databaseHealthCheck,
  adminAuthService,
  auditService,
  overviewService,
  operationalEventService,
  readModelService,
  handoffService
}: CreateAppDeps) => {
  const app = express();
  const messageController = new MessageController({ whatsappService, messageService });
  const resolvedAuditService = auditService ?? new AuditService();
  const resolvedOperationalEventService =
    operationalEventService ?? new OperationalEventService();
  const resolvedAuthService =
    adminAuthService ??
    new AdminAuthService(undefined, {
      sessionTtlMs: env.ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000
    });
  const resolvedOverviewService =
    overviewService ??
    new OverviewService(
      whatsappService,
      databaseHealthCheck,
      resolvedOperationalEventService
    );
  const adminAuthController = new AdminAuthController(
    resolvedAuthService,
    resolvedAuditService
  );
  const adminOverviewController = new AdminOverviewController(
    resolvedOverviewService
  );
  const adminSessionController = new AdminSessionController(
    whatsappService,
    resolvedOverviewService,
    resolvedAuditService,
    resolvedOperationalEventService
  );
  const adminSafetyController = new AdminSafetyController(
    whatsappService,
    resolvedOverviewService,
    resolvedAuditService
  );
  const adminReadController = new AdminReadController(
    readModelService ?? new ReadModelService()
  );
  const adminHandoffController = new AdminHandoffController(
    handoffService ?? new HandoffService(),
    resolvedAuditService
  );

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(createHealthRouter(whatsappService, databaseHealthCheck));
  app.use(
    createAdminRouter({
      authService: resolvedAuthService,
      authController: adminAuthController,
      overviewController: adminOverviewController,
      sessionController: adminSessionController,
      safetyController: adminSafetyController,
      readController: adminReadController,
      handoffController: adminHandoffController
    })
  );
  app.use(createWhatsAppRouter(whatsappService));
  app.use(createMessageRouter(messageController));

  app.use((request, response) => {
    if (request.path.startsWith('/api/admin/')) {
      response.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found',
          requestId: request.requestId
        }
      });
      return;
    }

    response.status(404).json({
      success: false,
      message: 'Route not found',
      requestId: request.requestId
    });
  });

  app.use(errorMiddleware);

  return app;
};
