import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AiRagController } from '../controllers/ai-rag.controller.js';
import { apiKeyMiddleware } from '../middleware/api-key.middleware.js';

export const createAiRuntimeRouter = (controller: AiRagController): Router => {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  });
  router.post(
    '/api/admin/v1/ai-chatbot/runtime/respond',
    limiter,
    apiKeyMiddleware,
    controller.respond
  );
  return router;
};
