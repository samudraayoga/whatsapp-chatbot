import type { Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { closeDatabase, connectDatabase } from './database/connection.js';
import { runMigrations } from './database/migrate.js';
import { ChatbotService } from './services/chatbot.service.js';
import { MessageService } from './services/message.service.js';
import { WhatsAppService } from './services/whatsapp.service.js';
import { logger } from './utils/logger.js';

const chatbotService = new ChatbotService();
const messageService = new MessageService();
const whatsappService = new WhatsAppService(chatbotService, messageService);

let httpServer: Server | null = null;
let isShuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info('Graceful shutdown started', { signal });

  try {
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

    await whatsappService.disconnect();
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
    await whatsappService.connect();

    const app = createApp({ whatsappService, messageService });

    httpServer = app.listen(env.PORT, () => {
      logger.info('Server started', {
        port: env.PORT,
        service: 'simple-whatsapp-chatbot'
      });
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
    await whatsappService.disconnect();
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  }
};

void startServer();
