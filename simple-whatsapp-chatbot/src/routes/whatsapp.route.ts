import { Router } from 'express';
import { WhatsAppService } from '../services/whatsapp.service.js';

export const createWhatsAppRouter = (whatsappService: WhatsAppService): Router => {
  const router = Router();

  router.get('/api/whatsapp/status', (_request, response) => {
    response.json({
      success: true,
      status: whatsappService.getStatus()
    });
  });

  return router;
};
