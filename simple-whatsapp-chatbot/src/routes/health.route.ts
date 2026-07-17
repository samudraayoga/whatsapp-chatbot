import { Router } from 'express';
import { checkDatabaseHealth } from '../database/connection.js';
import { WhatsAppService } from '../services/whatsapp.service.js';

export const createHealthRouter = (whatsappService: WhatsAppService): Router => {
  const router = Router();

  router.get('/health', async (_request, response, next) => {
    try {
      const isDatabaseConnected = await checkDatabaseHealth();

      response.json({
        success: true,
        service: 'simple-whatsapp-chatbot',
        database: isDatabaseConnected ? 'connected' : 'disconnected',
        whatsapp: whatsappService.getStatus()
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
