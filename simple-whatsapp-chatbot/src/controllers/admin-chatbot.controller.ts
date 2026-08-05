import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../middleware/error.middleware.js';
import {
  ChatbotRuleValidationError,
  type ChatbotRuleDefinition
} from '../services/chatbot-rules.js';
import {
  AuditService,
  recordAuditOutcome
} from '../services/audit.service.js';
import { ChatbotService } from '../services/chatbot.service.js';

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

const parseRules = (value: unknown): ChatbotRuleDefinition[] => {
  if (!Array.isArray(value)) {
    throw new AppError('rules must be an array', 400, 'CHATBOT_RULES_INVALID');
  }

  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new AppError(
        `Rule ${index + 1} must be an object`,
        400,
        'CHATBOT_RULES_INVALID'
      );
    }
    const rule = item as Record<string, unknown>;
    if (
      !Array.isArray(rule.triggerValues) ||
      rule.triggerValues.some((trigger) => typeof trigger !== 'string') ||
      typeof rule.priority !== 'number' ||
      typeof rule.enabled !== 'boolean'
    ) {
      throw new AppError(
        `Rule ${index + 1} has invalid field types`,
        400,
        'CHATBOT_RULES_INVALID'
      );
    }

    return {
      ...(typeof rule.id === 'string' ? { id: rule.id } : {}),
      triggerType: rule.triggerType as ChatbotRuleDefinition['triggerType'],
      triggerValues: rule.triggerValues as string[],
      responseText:
        typeof rule.responseText === 'string' ? rule.responseText : '',
      priority: rule.priority,
      enabled: rule.enabled,
      action: rule.action as ChatbotRuleDefinition['action']
    };
  });
};

const forwardRuleError = (error: unknown, next: NextFunction): void => {
  if (error instanceof ChatbotRuleValidationError) {
    next(
      new AppError(error.message, 400, 'CHATBOT_RULES_INVALID', {
        problems: error.problems
      })
    );
    return;
  }
  next(error);
};

export class AdminChatbotController {
  constructor(
    private readonly chatbot: ChatbotService,
    private readonly audit: AuditService
  ) {}

  getConfig = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.json({
        data: await this.chatbot.getConfig(),
        meta: responseMeta(request)
      });
    } catch (error) {
      next(error);
    }
  };

  updateConfig = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const expectedRevision = request.body?.expectedRevision;
      if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
        throw new AppError(
          'expectedRevision must be a non-negative integer',
          400,
          'CHATBOT_REVISION_INVALID'
        );
      }

      const rules = parseRules(request.body?.rules);
      await this.audit.record({
        ...auditContext(request),
        action: 'chatbot.config_update_requested',
        resourceType: 'chatbot_config',
        beforeState: {
          expectedRevision,
          ruleCount: rules.length
        }
      });

      const result = await this.chatbot.updateConfig({
        expectedRevision,
        rules
      });
      await recordAuditOutcome(this.audit, {
        ...auditContext(request),
        action: 'chatbot.config_updated',
        resourceType: 'chatbot_config',
        resourceId: result.audit.resourceId,
        beforeState: result.audit.before,
        afterState: result.audit.after
      });

      response.json({ data: result.config, meta: responseMeta(request) });
    } catch (error) {
      forwardRuleError(error, next);
    }
  };

  testRules = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (
        typeof request.body?.input !== 'string' ||
        request.body.input.length > 4096
      ) {
        throw new AppError(
          'input must be a string with at most 4096 characters',
          400,
          'CHATBOT_TEST_INPUT_INVALID'
        );
      }

      response.json({
        data: this.chatbot.preview(
          request.body.input,
          parseRules(request.body?.rules)
        ),
        meta: responseMeta(request)
      });
    } catch (error) {
      forwardRuleError(error, next);
    }
  };
}
