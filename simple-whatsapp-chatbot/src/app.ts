import express from 'express';
import { errorMiddleware } from './middleware/error.middleware.js';
import { createHealthRouter } from './routes/health.route.js';
import { createMessageRouter } from './routes/message.route.js';
import { createWhatsAppRouter } from './routes/whatsapp.route.js';
import { MessageController } from './controllers/message.controller.js';
import { MessageService } from './services/message.service.js';
import { WhatsAppService } from './services/whatsapp.service.js';

type CreateAppDeps = {
  whatsappService: WhatsAppService;
  messageService: MessageService;
};

export const createApp = ({ whatsappService, messageService }: CreateAppDeps) => {
  const app = express();
  const messageController = new MessageController({ whatsappService, messageService });

  app.use(express.json());
  app.use(createHealthRouter(whatsappService));
  app.use(createWhatsAppRouter(whatsappService));
  app.use(createMessageRouter(messageController));

  app.use((_request, response) => {
    response.status(404).json({
      success: false,
      message: 'Route not found'
    });
  });

  app.use(errorMiddleware);

  return app;
};
