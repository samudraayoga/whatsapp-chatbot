import { Router } from 'express';
import { MessageController } from '../controllers/message.controller.js';
import { apiKeyMiddleware } from '../middleware/api-key.middleware.js';

export const createMessageRouter = (messageController: MessageController): Router => {
  const router = Router();

  router.post('/api/messages/send', apiKeyMiddleware, messageController.sendMessage);

  return router;
};
