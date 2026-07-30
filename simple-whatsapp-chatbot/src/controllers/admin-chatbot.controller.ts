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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseUuid = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new AppError(`${label} is invalid`, 400, 'INVALID_RESOURCE_ID');
  }
  return value;
};

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

export class AdminChatbotController {
  constructor(
    private readonly chatbot: ChatbotService,
    private readonly audit: AuditService
  ) {}

  listVersions = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.json({
        data: await this.chatbot.listVersions(),
        meta: responseMeta(request)
      });
    } catch (error) {
      next(error);
    }
  };

  getVersion = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const versionId = parseUuid(request.params.versionId, 'Version ID');
      const result = await this.chatbot.getVersion(versionId);
      if (!result) {
        throw new AppError(
          'Chatbot version was not found',
          404,
          'CHATBOT_VERSION_NOT_FOUND'
        );
      }
      response.json({ data: result, meta: responseMeta(request) });
    } catch (error) {
      next(error);
    }
  };

  createDraft = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const rawName = request.body?.name;
      if (
        rawName !== undefined &&
        (typeof rawName !== 'string' ||
          rawName.trim().length < 3 ||
          rawName.trim().length > 150)
      ) {
        throw new AppError(
          'Draft name must contain 3 to 150 characters',
          400,
          'CHATBOT_DRAFT_NAME_INVALID'
        );
      }
      await this.audit.record({
        ...auditContext(request),
        action: 'chatbot.draft_create_requested',
        resourceType: 'chatbot_rule_version'
      });
      const result = await this.chatbot.createDraft(
        request.adminAuth!.id,
        typeof rawName === 'string' ? rawName : undefined
      );
      await recordAuditOutcome(this.audit, {
        ...auditContext(request),
        action: 'chatbot.draft_created',
        resourceType: 'chatbot_rule_version',
        resourceId: result!.version.id,
        afterState: {
          versionNumber: result!.version.versionNumber,
          basedOnVersionId: result!.version.basedOnVersionId,
          ruleCount: result!.rules.length
        }
      });
      response.status(201).json({ data: result, meta: responseMeta(request) });
    } catch (error) {
      next(error);
    }
  };

  replaceRules = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const versionId = parseUuid(request.params.versionId, 'Version ID');
      const expectedRevision = Number(request.body?.expectedRevision);
      if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
        throw new AppError(
          'expectedRevision must be a non-negative integer',
          400,
          'CHATBOT_REVISION_INVALID'
        );
      }
      const before = await this.chatbot.getVersion(versionId);
      await this.audit.record({
        ...auditContext(request),
        action: 'chatbot.draft_update_requested',
        resourceType: 'chatbot_rule_version',
        resourceId: versionId,
        beforeState: {
          expectedRevision,
          currentRevision: before?.version.revision ?? null
        }
      });
      const result = await this.chatbot.replaceDraftRules({
        versionId,
        expectedRevision,
        rules: parseRules(request.body?.rules)
      });
      await recordAuditOutcome(this.audit, {
        ...auditContext(request),
        action: 'chatbot.draft_updated',
        resourceType: 'chatbot_rule_version',
        resourceId: versionId,
        beforeState: {
          revision: before?.version.revision ?? null,
          contentHash: before?.version.contentHash ?? null,
          ruleCount: before?.rules.length ?? null
        },
        afterState: {
          revision: result?.version.revision ?? null,
          contentHash: result?.version.contentHash ?? null,
          ruleCount: result?.rules.length ?? null
        }
      });
      response.json({ data: result, meta: responseMeta(request) });
    } catch (error) {
      if (error instanceof ChatbotRuleValidationError) {
        next(
          new AppError(error.message, 400, 'CHATBOT_RULES_INVALID', {
            problems: error.problems
          })
        );
        return;
      }
      next(error);
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
      const versionId =
        request.body?.versionId === undefined
          ? undefined
          : parseUuid(request.body.versionId, 'Version ID');
      response.json({
        data: await this.chatbot.evaluate(request.body.input, versionId),
        meta: responseMeta(request)
      });
    } catch (error) {
      next(error);
    }
  };

  publish = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const versionId = parseUuid(request.params.versionId, 'Version ID');
      const expectedActiveVersionId = parseUuid(
        request.body?.expectedActiveVersionId,
        'Active version ID'
      );
      const changeSummary =
        typeof request.body?.changeSummary === 'string'
          ? request.body.changeSummary.trim()
          : '';
      if (request.body?.confirmation !== 'PUBLISH') {
        throw new AppError(
          'Type PUBLISH to confirm this change',
          400,
          'CHATBOT_PUBLISH_CONFIRMATION_REQUIRED'
        );
      }
      if (changeSummary.length < 5 || changeSummary.length > 500) {
        throw new AppError(
          'Change summary must contain 5 to 500 characters',
          400,
          'CHATBOT_CHANGE_SUMMARY_INVALID'
        );
      }
      await this.audit.record({
        ...auditContext(request),
        action: 'chatbot.version_publish_requested',
        resourceType: 'chatbot_rule_version',
        resourceId: versionId,
        reason: changeSummary,
        beforeState: { activeVersionId: expectedActiveVersionId }
      });
      const result = await this.chatbot.publish({
        versionId,
        actorUserId: request.adminAuth!.id,
        expectedActiveVersionId,
        changeSummary
      });
      await recordAuditOutcome(this.audit, {
        ...auditContext(request),
        action: 'chatbot.version_published',
        resourceType: 'chatbot_rule_version',
        resourceId: versionId,
        reason: changeSummary,
        beforeState: { activeVersionId: expectedActiveVersionId },
        afterState: {
          activeVersionId: versionId,
          contentHash: result?.version.contentHash ?? null
        }
      });
      response.json({ data: result, meta: responseMeta(request) });
    } catch (error) {
      next(error);
    }
  };

  rollback = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const targetVersionId = parseUuid(
        request.params.versionId,
        'Version ID'
      );
      const expectedActiveVersionId = parseUuid(
        request.body?.expectedActiveVersionId,
        'Active version ID'
      );
      const reason =
        typeof request.body?.reason === 'string'
          ? request.body.reason.trim()
          : '';
      if (request.body?.confirmation !== 'ROLLBACK') {
        throw new AppError(
          'Type ROLLBACK to confirm this change',
          400,
          'CHATBOT_ROLLBACK_CONFIRMATION_REQUIRED'
        );
      }
      if (reason.length < 5 || reason.length > 500) {
        throw new AppError(
          'Rollback reason must contain 5 to 500 characters',
          400,
          'CHATBOT_ROLLBACK_REASON_INVALID'
        );
      }
      await this.audit.record({
        ...auditContext(request),
        action: 'chatbot.version_rollback_requested',
        resourceType: 'chatbot_rule_version',
        resourceId: targetVersionId,
        reason,
        beforeState: { activeVersionId: expectedActiveVersionId }
      });
      const result = await this.chatbot.rollback({
        targetVersionId,
        actorUserId: request.adminAuth!.id,
        expectedActiveVersionId
      });
      await recordAuditOutcome(this.audit, {
        ...auditContext(request),
        action: 'chatbot.version_rolled_back',
        resourceType: 'chatbot_rule_version',
        resourceId: targetVersionId,
        reason,
        beforeState: { activeVersionId: expectedActiveVersionId },
        afterState: {
          activeVersionId: targetVersionId,
          contentHash: result?.version.contentHash ?? null
        }
      });
      response.json({ data: result, meta: responseMeta(request) });
    } catch (error) {
      next(error);
    }
  };
}
