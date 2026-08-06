import type { Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { closeDatabase, connectDatabase } from './database/connection.js';
import { runMigrations } from './database/migrate.js';
import { ChatbotService } from './services/chatbot.service.js';
import { MessageService } from './services/message.service.js';
import { WhatsAppService } from './services/whatsapp.service.js';
import { AdminAuthService } from './services/admin-auth.service.js';
import { AuditService } from './services/audit.service.js';
import { OverviewService } from './services/overview.service.js';
import { OperationalEventService } from './services/operational-event.service.js';
import { logger } from './utils/logger.js';
import { OutboxService } from './services/outbox.service.js';
import { OutboxWorker } from './services/outbox-worker.service.js';
import { SafetyCenterService } from './services/safety-center.service.js';
import { HandoffService } from './services/handoff.service.js';
import { WhatsAppRuntime } from './services/whatsapp-runtime.service.js';
import { TenantContextService } from './services/tenant-context.service.js';
import { AiChatbotService } from './services/ai-chatbot.service.js';
import { KnowledgeService } from './services/knowledge.service.js';
import { DocumentService } from './services/document.service.js';
import { createDocumentObjectStorage } from './services/document-storage.service.js';
import {
  createProcessingQueue,
  createProcessingWorker
} from './services/document-queue.service.js';
import { AiRagRuntimeService } from './services/ai-rag-runtime.service.js';

const chatbotService = new ChatbotService();
const messageService = new MessageService();
const operationalEventService = new OperationalEventService();
const outboxService = new OutboxService();
const handoffService = new HandoffService();
const aiRagRuntimeService = new AiRagRuntimeService();
const whatsappService = new WhatsAppService(
  chatbotService,
  messageService,
  operationalEventService,
  aiRagRuntimeService,
  outboxService,
  env.AI_CHATBOT_DEFAULT_TENANT_ID
);
const auditService = new AuditService();
const adminAuthService = new AdminAuthService(undefined, {
  sessionTtlMs: env.ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000
});
const overviewService = new OverviewService(
  whatsappService,
  undefined,
  operationalEventService,
  outboxService,
  handoffService
);
const outboxWorker = new OutboxWorker(outboxService, whatsappService);
const whatsappRuntime = new WhatsAppRuntime(whatsappService);
const safetyCenterService = new SafetyCenterService(
  whatsappService,
  outboxService
);
const tenantContextService = new TenantContextService();
const aiChatbotService = new AiChatbotService();
const knowledgeService = new KnowledgeService();
const documentStorage = createDocumentObjectStorage({
  endpoint: env.OBJECT_STORAGE_ENDPOINT,
  bucket: env.OBJECT_STORAGE_BUCKET,
  region: env.OBJECT_STORAGE_REGION,
  accessKey: env.OBJECT_STORAGE_ACCESS_KEY,
  secretKey: env.OBJECT_STORAGE_SECRET_KEY
});
const documentQueue = createProcessingQueue(env.REDIS_URL);
const documentService = new DocumentService(
  undefined,
  documentStorage,
  documentQueue,
  undefined,
  env.AI_DOCUMENT_MAX_BYTES
);
const documentWorker = createProcessingWorker(
  env.REDIS_URL,
  (job, attempt) => documentService.processJob(job, attempt),
  env.AI_DOCUMENT_WORKER_CONCURRENCY
);
let httpServer: Server | null = null;
let isShuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info('Graceful shutdown started', { signal });

  try {
    outboxWorker.stop();
    await documentWorker?.close();
    await documentQueue.close();

    await new Promise<void>((resolve, reject) => {
      if (!httpServer) {
        resolve();
        return;
      }

      httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    await whatsappRuntime.stop();
    await closeDatabase();
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown shutdown error';
    logger.error('Graceful shutdown failed', { error: message });
    process.exit(1);
  }
};

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();
    await runMigrations();
    await chatbotService.warmCache();
    await safetyCenterService.restoreManualState();
    await adminAuthService.ensureBootstrapAdmins(env.ADMIN_BOOTSTRAP_ACCOUNTS);
    if (env.AI_CHATBOT_DEFAULT_TENANT_ID) {
      await tenantContextService.ensureBootstrapTenant({
        tenantId: env.AI_CHATBOT_DEFAULT_TENANT_ID,
        slug: env.AI_CHATBOT_DEFAULT_TENANT_SLUG,
        name: env.AI_CHATBOT_DEFAULT_TENANT_NAME
      });
      await aiChatbotService.ensureDefaultIntegration(
        env.AI_CHATBOT_DEFAULT_TENANT_ID
      );
      await knowledgeService.ensureInitialCategories(
        env.AI_CHATBOT_DEFAULT_TENANT_ID
      );
    }
    await adminAuthService.removeExpiredSessions();

    const app = createApp({
      whatsappService,
      messageService,
      adminAuthService,
      auditService,
      overviewService,
      operationalEventService,
      outboxService,
      handoffService,
      chatbotService,
      safetyCenterService,
      tenantContextService,
      aiChatbotService,
      knowledgeService,
      documentService,
      aiRagRuntimeService
    });

    httpServer = app.listen(env.PORT, () => {
      logger.info('Server started', {
        port: env.PORT,
        service: 'simple-whatsapp-chatbot'
      });
      outboxWorker.start();
      documentWorker?.start();
      whatsappRuntime.start();
    });

    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });

    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown startup error';
    logger.error('Application startup failed', { error: message });
    outboxWorker.stop();
    await whatsappRuntime.stop();
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  }
};

void startServer();
