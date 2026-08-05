import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';
import { AiRagRuntimeService } from '../services/ai-rag-runtime.service.js';
import { AuditService } from '../services/audit.service.js';
import { requireUuid } from '../services/ai-chatbot-validation.js';

const requireString = (value: unknown, field: string, maximum: number): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new AppError(`${field} is required and must be at most ${maximum} characters`, 400, 'AI_RUNTIME_INPUT_INVALID', { field });
  }
  return value.trim();
};

const resultEnvelope = (request: Request, data: Awaited<ReturnType<AiRagRuntimeService['respond']>>) => ({
  data,
  meta: { requestId: request.requestId, generatedAt: new Date().toISOString() }
});

export class AiRagController {
  constructor(
    private readonly runtime: AiRagRuntimeService,
    private readonly audit: AuditService
  ) {}

  playground = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const message = requireString(request.body?.message, 'message', 4096);
      const recentContext = request.body?.recentContext === undefined
        ? [] : request.body.recentContext;
      if (!Array.isArray(recentContext) || recentContext.length > 10 ||
          recentContext.some((item) => typeof item !== 'string' || !item.trim() || item.length > 1000)) {
        throw new AppError('recentContext must contain at most 10 bounded messages', 400, 'AI_RUNTIME_INPUT_INVALID');
      }
      const promptVersionId = request.body?.promptVersionId === null || request.body?.promptVersionId === undefined
        ? null : requireUuid(String(request.body.promptVersionId), 'promptVersionId');
      const result = await this.runtime.respond({
        tenantId: request.tenantContext!.tenantId,
        channel: 'playground',
        channelSessionId: request.adminAuth!.id,
        customerIdentifier: `playground:${request.adminAuth!.id}`,
        providerMessageId: `playground:${randomUUID()}`,
        message,
        timestamp: new Date().toISOString(),
        requireActiveIntegration: false,
        promptVersionId,
        recentContext: recentContext.map((item) => String(item).trim())
      });
      await this.audit.record({
        actorUserId: request.adminAuth!.id,
        action: 'ai.playground_tested',
        resourceType: 'ai_message_trace',
        resourceId: result.traceId,
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent'),
        afterState: {
          tenantId: request.tenantContext!.tenantId,
          answerStatus: result.answerStatus,
          validationStatus: result.validationStatus,
          sourceCount: result.usedKnowledge.length,
          model: result.model,
          latencyMs: result.latencyMs
        }
      });
      response.setHeader('Cache-Control', 'no-store');
      response.json(resultEnvelope(request, result));
    } catch (error) { next(error); }
  };

  respond = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!env.AI_CHATBOT_ALPHA_RUNTIME_ENABLED) {
        throw new AppError('Alpha AI runtime is disabled', 503, 'AI_ALPHA_RUNTIME_DISABLED');
      }
      if (!env.AI_CHATBOT_DEFAULT_TENANT_ID) {
        throw new AppError('Runtime tenant mapping is unavailable', 503, 'AI_RUNTIME_TENANT_UNRESOLVED');
      }
      if (request.body?.channel !== 'whatsapp') {
        throw new AppError('channel must be whatsapp', 400, 'AI_RUNTIME_INPUT_INVALID', { field: 'channel' });
      }
      const providerMessageId = requireString(request.body?.providerMessageId, 'providerMessageId', 255);
      const idempotencyKey = requireString(request.header('Idempotency-Key'), 'Idempotency-Key', 255);
      if (idempotencyKey !== providerMessageId) {
        throw new AppError('Idempotency-Key must equal providerMessageId', 409, 'AI_RUNTIME_IDEMPOTENCY_CONFLICT');
      }
      const timestamp = requireString(request.body?.timestamp, 'timestamp', 100);
      if (!Number.isFinite(Date.parse(timestamp))) {
        throw new AppError('timestamp must be ISO-8601', 400, 'AI_RUNTIME_INPUT_INVALID', { field: 'timestamp' });
      }
      const result = await this.runtime.respond({
        tenantId: env.AI_CHATBOT_DEFAULT_TENANT_ID,
        channel: 'whatsapp',
        channelSessionId: requireString(request.body?.channelSessionId, 'channelSessionId', 150),
        customerIdentifier: requireString(request.body?.customerIdentifier, 'customerIdentifier', 255),
        providerMessageId,
        message: requireString(request.body?.message, 'message', 4096),
        timestamp: new Date(timestamp).toISOString(),
        requireActiveIntegration: true
      });
      response.setHeader('Cache-Control', 'no-store');
      response.json(resultEnvelope(request, result));
    } catch (error) { next(error); }
  };
}
