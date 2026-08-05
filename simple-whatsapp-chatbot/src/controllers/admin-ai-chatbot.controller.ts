import type { NextFunction, Request, Response } from 'express';
import { AiChatbotFoundationService } from '../services/ai-chatbot-foundation.service.js';
import { AiChatbotService } from '../services/ai-chatbot.service.js';
import {
  parseActivationRequest,
  parseDeactivateRequest,
  parseIntegrationUpdate,
  parseLifecycleRequest,
  parsePromptCreate,
  requireUuid
} from '../services/ai-chatbot-validation.js';
import {
  AuditService,
  recordAuditOutcome
} from '../services/audit.service.js';
import { AppError } from '../middleware/error.middleware.js';

const responseMeta = (request: Request) => ({
  requestId: request.requestId,
  generatedAt: new Date().toISOString()
});

const auditContext = (request: Request) => ({
  actorUserId: request.adminAuth!.id,
  requestId: request.requestId,
  ipAddress: request.ip,
  userAgent: request.get('user-agent')
});

const integrationAuditState = (value: Awaited<ReturnType<AiChatbotService['getIntegration']>>) => ({
  tenantId: value.tenantId,
  provider: value.provider,
  chatModel: value.chatModel,
  embeddingProvider: value.embeddingProvider,
  embeddingModel: value.embeddingModel,
  embeddingDimensions: value.embeddingDimensions,
  secretReferenceConfigured: value.secretReferenceConfigured,
  active: value.active,
  strictGrounding: value.strictGrounding,
  revision: value.revision,
  retrieval: value.retrieval,
  featureFlags: value.featureFlags
});

const promptAuditState = (value: {
  id: string;
  tenantId: string;
  version: number;
  status: string;
  name: string;
}) => ({
  id: value.id,
  tenantId: value.tenantId,
  version: value.version,
  status: value.status,
  name: value.name
});

export class AdminAiChatbotController {
  constructor(
    private readonly foundation: AiChatbotFoundationService,
    private readonly aiChatbot: AiChatbotService,
    private readonly audit: AuditService
  ) {}

  getFoundation = (
    request: Request,
    response: Response,
    next: NextFunction
  ): void => {
    try {
      response.json({
        data: this.foundation.getFoundation(request.tenantContext!.tenantId),
        meta: responseMeta(request)
      });
    } catch (error) {
      next(error);
    }
  };

  getIntegration = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const tenantId = request.tenantContext!.tenantId;
      const [integration, readiness] = await Promise.all([
        this.aiChatbot.getIntegration(tenantId),
        this.aiChatbot.getReadiness(tenantId)
      ]);
      response.json({
        data: { integration, readiness },
        meta: responseMeta(request)
      });
    } catch (error) {
      next(error);
    }
  };

  updateIntegration = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const tenantId = request.tenantContext!.tenantId;
      const input = parseIntegrationUpdate(request.body);
      await this.audit.record({
        ...auditContext(request),
        action: 'ai.integration_update_requested',
        resourceType: 'ai_integration',
        resourceId: tenantId,
        beforeState: {
          tenantId,
          expectedRevision: input.expectedRevision,
          secretReferenceSubmitted: Object.prototype.hasOwnProperty.call(
            input,
            'secretReference'
          )
        }
      });
      const result = await this.aiChatbot.updateIntegration(tenantId, input);
      await recordAuditOutcome(this.audit, {
        ...auditContext(request),
        action: 'ai.integration_updated',
        resourceType: 'ai_integration',
        resourceId: result.after.id,
        beforeState: integrationAuditState(result.before),
        afterState: integrationAuditState(result.after)
      });
      response.json({
        data: {
          integration: result.after,
          readiness: await this.aiChatbot.getReadiness(tenantId)
        },
        meta: responseMeta(request)
      });
    } catch (error) {
      next(error);
    }
  };

  testConnection = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await this.aiChatbot.testConnection(
        request.tenantContext!.tenantId
      );
      await recordAuditOutcome(this.audit, {
        ...auditContext(request),
        action: 'ai.connection_tested',
        resourceType: 'ai_integration',
        resourceId: request.tenantContext!.tenantId,
        afterState: result
      });
      response.json({ data: result, meta: responseMeta(request) });
    } catch (error) {
      next(error);
    }
  };

  activate = async (
    request: Request,
    _response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const input = parseActivationRequest(request.body);
      await this.audit.record({
        ...auditContext(request),
        action: 'ai.activation_requested',
        resourceType: 'ai_integration',
        resourceId: request.tenantContext!.tenantId,
        beforeState: { expectedRevision: input.expectedRevision }
      });
      await this.aiChatbot.activate(
        request.tenantContext!.tenantId,
        input.expectedRevision
      );
    } catch (error) {
      next(error);
    }
  };

  deactivate = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const input = parseDeactivateRequest(request.body);
      const result = await this.aiChatbot.deactivate(
        request.tenantContext!.tenantId,
        input.expectedRevision
      );
      await this.audit.record({
        ...auditContext(request),
        action: 'ai.integration_deactivated',
        resourceType: 'ai_integration',
        resourceId: result.after.id,
        reason: input.reason,
        beforeState: integrationAuditState(result.before),
        afterState: integrationAuditState(result.after)
      });
      response.json({
        data: {
          integration: result.after,
          readiness: await this.aiChatbot.getReadiness(
            request.tenantContext!.tenantId
          )
        },
        meta: responseMeta(request)
      });
    } catch (error) {
      next(error);
    }
  };

  listPrompts = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const limit = request.query.limit === undefined
        ? 20
        : Number(request.query.limit);
      const beforeVersion = request.query.cursor === undefined
        ? null
        : Number(request.query.cursor);
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 50 ||
        (beforeVersion !== null &&
          (!Number.isInteger(beforeVersion) || beforeVersion < 1))
      ) {
        throw new AppError(
          'Prompt pagination is invalid',
          400,
          'AI_PROMPT_PAGINATION_INVALID'
        );
      }
      const result = await this.aiChatbot.listPrompts(
        request.tenantContext!.tenantId,
        { limit, beforeVersion }
      );
      response.json({
        data: result.data,
        meta: { ...responseMeta(request), nextCursor: result.nextCursor }
      });
    } catch (error) {
      next(error);
    }
  };

  createPrompt = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const prompt = await this.aiChatbot.createPrompt(
        request.tenantContext!.tenantId,
        request.adminAuth!.id,
        parsePromptCreate(request.body)
      );
      await this.audit.record({
        ...auditContext(request),
        action: 'ai.prompt_created',
        resourceType: 'ai_prompt_version',
        resourceId: prompt.id,
        afterState: promptAuditState(prompt)
      });
      response.status(201).json({ data: prompt, meta: responseMeta(request) });
    } catch (error) {
      next(error);
    }
  };

  approvePrompt = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const input = parseLifecycleRequest(request.body);
      const prompt = await this.aiChatbot.approvePrompt(
        request.tenantContext!.tenantId,
        requireUuid(request.params.promptId ?? '', 'promptId'),
        request.adminAuth!.id,
        input.expectedVersion
      );
      await this.audit.record({
        ...auditContext(request),
        action: 'ai.prompt_approved',
        resourceType: 'ai_prompt_version',
        resourceId: prompt.id,
        reason: input.changeReason,
        afterState: promptAuditState(prompt)
      });
      response.json({ data: prompt, meta: responseMeta(request) });
    } catch (error) {
      next(error);
    }
  };

  publishPrompt = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const input = parseLifecycleRequest(request.body);
      const prompt = await this.aiChatbot.publishPrompt(
        request.tenantContext!.tenantId,
        requireUuid(request.params.promptId ?? '', 'promptId'),
        input.expectedVersion
      );
      await this.audit.record({
        ...auditContext(request),
        action: 'ai.prompt_published',
        resourceType: 'ai_prompt_version',
        resourceId: prompt.id,
        reason: input.changeReason,
        afterState: promptAuditState(prompt)
      });
      response.json({ data: prompt, meta: responseMeta(request) });
    } catch (error) {
      next(error);
    }
  };
}
