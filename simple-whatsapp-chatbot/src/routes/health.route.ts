import { Router } from 'express';
import { checkDatabaseHealth } from '../database/connection.js';
import { WhatsAppService } from '../services/whatsapp.service.js';

type DatabaseHealthCheck = () => Promise<boolean>;

export const createHealthRouter = (
  whatsappService: WhatsAppService,
  databaseHealthCheck: DatabaseHealthCheck = checkDatabaseHealth
): Router => {
  const router = Router();

  router.get('/health/live', (request, response) => {
    response.json({
      success: true,
      service: 'simple-whatsapp-chatbot',
      status: 'live',
      requestId: request.requestId
    });
  });

  router.get('/health/ready', async (request, response, next) => {
    try {
      const isDatabaseConnected = await databaseHealthCheck();
      response.status(isDatabaseConnected ? 200 : 503).json({
        success: isDatabaseConnected,
        service: 'simple-whatsapp-chatbot',
        database: isDatabaseConnected ? 'connected' : 'disconnected',
        whatsapp: whatsappService.getStatus(),
        requestId: request.requestId
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/health', async (_request, response, next) => {
    try {
      const isDatabaseConnected = await databaseHealthCheck();

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
