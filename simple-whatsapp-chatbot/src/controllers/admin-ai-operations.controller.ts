import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../middleware/error.middleware.js';
import { requireUuid } from '../services/ai-chatbot-validation.js';
import {
  AiOperationsService,
  type FeedbackType,
  releaseGateKeys,
  type ReleaseGateKey,
  type TestCaseInput,
  type UnansweredStatus
} from '../services/ai-operations.service.js';
import { AuditService } from '../services/audit.service.js';

const meta = (request: Request, extra: Record<string, unknown> = {}) => ({
  requestId: request.requestId, generatedAt: new Date().toISOString(), ...extra
});
const bool = (value: unknown, field: string): boolean | undefined => {
  if (value === undefined) return undefined;
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  throw new AppError(`${field} must be true or false`, 400, 'AI_OPERATIONS_FILTER_INVALID');
};
const text = (value: unknown, field: string, maximum: number, required = true): string | null => {
  if (value === null || value === undefined) {
    if (!required) return null;
    throw new AppError(`${field} is required`, 400, 'AI_OPERATIONS_INPUT_INVALID');
  }
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > maximum) {
    throw new AppError(`${field} is invalid`, 400, 'AI_OPERATIONS_INPUT_INVALID');
  }
  return value.trim() || null;
};
const strings = (value: unknown, field: string, maximumItems = 30): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumItems ||
      value.some((item) => typeof item !== 'string' || !item.trim() || item.length > 500)) {
    throw new AppError(`${field} is invalid`, 400, 'AI_OPERATIONS_INPUT_INVALID');
  }
  return [...new Set(value.map((item) => String(item).trim()))];
};
const uuidOrNull = (value: unknown, field: string): string | null => value === null || value === undefined || value === ''
  ? null : requireUuid(String(value), field);
const dateTime = (value: unknown, field: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || Number.isNaN(Date.parse(value))) {
    throw new AppError(`${field} must be a valid date-time`, 400, 'AI_OPERATIONS_FILTER_INVALID');
  }
  return new Date(value).toISOString();
};
const boundedNumber = (value: unknown, field: string, minimum: number, maximum: number, nullable = false): number | null => {
  if ((value === null || value === undefined || value === '') && nullable) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new AppError(`${field} is invalid`, 400, 'AI_OPERATIONS_INPUT_INVALID');
  }
  return parsed;
};
const boundedInteger = (value: unknown, field: string, minimum: number, maximum: number): number => {
  const parsed = boundedNumber(value, field, minimum, maximum);
  if (parsed === null || !Number.isInteger(parsed)) throw new AppError(`${field} must be an integer`, 400, 'AI_OPERATIONS_INPUT_INVALID');
  return parsed;
};
const pagination = (request: Request) => {
  const limit = request.query.limit === undefined ? 20 : Number(request.query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError('limit must be between 1 and 100', 400, 'AI_OPERATIONS_FILTER_INVALID');
  }
  return { limit, cursor: typeof request.query.cursor === 'string' ? request.query.cursor : undefined };
};
const auditContext = (request: Request) => ({
  actorUserId: request.adminAuth!.id, requestId: request.requestId,
  ipAddress: request.ip, userAgent: request.get('user-agent')
});

const feedbackTypes: FeedbackType[] = [
  'correct', 'incorrect', 'incomplete', 'unsafe',
  'wrong_source', 'too_long', 'too_promotional'
];
const unansweredStatuses: UnansweredStatus[] = [
  'new', 'reviewing', 'knowledge_created', 'ignored', 'resolved'
];
const answerStatuses = [
  'supported', 'partially_supported', 'unsupported', 'safety_fallback', 'admin_required'
] as const;

const parseTestCase = (body: unknown): TestCaseInput => {
  const value = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const expectedHandoff = value.expectedHandoff === null || value.expectedHandoff === undefined
    ? null : bool(value.expectedHandoff, 'expectedHandoff')!;
  return {
    name: text(value.name, 'name', 160)!, question: text(value.question, 'question', 4096)!,
    recentContext: strings(value.recentContext, 'recentContext', 10),
    promptVersionId: uuidOrNull(value.promptVersionId, 'promptVersionId'),
    expectedCategory: text(value.expectedCategory, 'expectedCategory', 50, false),
    expectedKnowledgeIds: strings(value.expectedKnowledgeIds, 'expectedKnowledgeIds', 20),
    mustContain: strings(value.mustContain, 'mustContain', 20),
    mustNotContain: strings(value.mustNotContain, 'mustNotContain', 20),
    expectedHandoff,
    active: value.active === undefined ? true : bool(value.active, 'active')!
  };
};

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export class AdminAiOperationsController {
  constructor(private readonly operations: AiOperationsService, private readonly audit: AuditService) {}

  listConversations = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const { limit, cursor } = pagination(request);
      const channel = request.query.channel;
      if (channel !== undefined && channel !== 'whatsapp' && channel !== 'playground') {
        throw new AppError('channel is invalid', 400, 'AI_OPERATIONS_FILTER_INVALID');
      }
      const answerStatus = typeof request.query.answerStatus === 'string' ? request.query.answerStatus : undefined;
      if (answerStatus && !answerStatuses.includes(answerStatus as typeof answerStatuses[number])) {
        throw new AppError('answerStatus is invalid', 400, 'AI_OPERATIONS_FILTER_INVALID');
      }
      const fallback = bool(request.query.fallback, 'fallback');
      const handoff = bool(request.query.handoff, 'handoff');
      const from = dateTime(request.query.from, 'from');
      const to = dateTime(request.query.to, 'to');
      const result = await this.operations.listConversations(request.tenantContext!.tenantId, {
        limit, cursor,
        ...(typeof request.query.query === 'string' ? { query: request.query.query.slice(0, 100) } : {}),
        ...(channel ? { channel } : {}), ...(answerStatus ? { answerStatus } : {}),
        ...(fallback === undefined ? {} : { fallback }),
        ...(handoff === undefined ? {} : { handoff }),
        ...(bool(request.query.lowConfidence, 'lowConfidence') ? { lowConfidence: true } : {}),
        ...(bool(request.query.unanswered, 'unanswered') ? { unanswered: true } : {}),
        ...(request.query.categoryId ? { categoryId: requireUuid(String(request.query.categoryId), 'categoryId') } : {}),
        ...(typeof request.query.model === 'string' ? { model: request.query.model.slice(0, 100) } : {}),
        ...(request.query.reviewerId ? { reviewerId: requireUuid(String(request.query.reviewerId), 'reviewerId') } : {}),
        ...(from ? { from } : {}), ...(to ? { to } : {})
      });
      response.setHeader('Cache-Control', 'no-store');
      response.json({ data: result.data, meta: meta(request, { nextCursor: result.nextCursor }) });
    } catch (error) { next(error); }
  };

  exportConversations = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.operations.listConversations(request.tenantContext!.tenantId, { limit: 100 });
      const rows = [
        ['conversation_id', 'customer', 'channel', 'status', 'answer_status', 'fallback_count', 'handoff', 'model', 'trace_id', 'last_message_at'],
        ...result.data.map((item) => [item.id, item.customer.maskedIdentifier, item.channel,
          item.status, item.lastAnswerStatus, item.fallbackCount, item.handoff,
          item.lastModel, item.lastTraceId, item.lastMessageAt])
      ];
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', 'attachment; filename="ai-conversation-logs.csv"');
      response.setHeader('Cache-Control', 'no-store');
      response.send(rows.map((row) => row.map(csvCell).join(',')).join('\n'));
    } catch (error) { next(error); }
  };

  getConversation = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.operations.getConversation(request.tenantContext!.tenantId,
        requireUuid(request.params.conversationId ?? '', 'conversationId'));
      response.setHeader('Cache-Control', 'no-store'); response.json({ data, meta: meta(request) });
    } catch (error) { next(error); }
  };

  listMessages = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.operations.listConversationMessages(
        request.tenantContext!.tenantId,
        requireUuid(request.params.conversationId ?? '', 'conversationId'), pagination(request)
      );
      response.setHeader('Cache-Control', 'no-store');
      response.json({ data: result.data, meta: meta(request, { nextCursor: result.nextCursor }) });
    } catch (error) { next(error); }
  };

  saveFeedback = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const type = request.body?.type as FeedbackType;
      if (!feedbackTypes.includes(type)) throw new AppError('feedback type is invalid', 400, 'AI_FEEDBACK_INVALID');
      const traceId = requireUuid(request.params.traceId ?? '', 'traceId');
      const data = await this.operations.saveFeedback(request.tenantContext!.tenantId, traceId,
        request.adminAuth!.id, {
          type, comment: text(request.body?.comment, 'comment', 2000, false),
          correctKnowledgeIds: strings(request.body?.correctKnowledgeIds, 'correctKnowledgeIds', 20)
            .map((id) => requireUuid(id, 'correctKnowledgeIds')),
          suggestedAnswer: text(request.body?.suggestedAnswer, 'suggestedAnswer', 4096, false)
        });
      await this.audit.record({ ...auditContext(request), action: 'ai.message_feedback_saved',
        resourceType: 'ai_message_trace', resourceId: traceId,
        afterState: { type: data.type, correctKnowledgeCount: data.correctKnowledgeIds.length } });
      response.json({ data, meta: meta(request) });
    } catch (error) { next(error); }
  };

  listUnanswered = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const status = typeof request.query.status === 'string' ? request.query.status : 'new';
      if (status !== 'all' && !unansweredStatuses.includes(status as UnansweredStatus)) {
        throw new AppError('status is invalid', 400, 'UNANSWERED_FILTER_INVALID');
      }
      const result = await this.operations.listUnanswered(request.tenantContext!.tenantId, {
        ...pagination(request), status: status as UnansweredStatus | 'all',
        ...(typeof request.query.query === 'string' ? { query: request.query.query.slice(0, 100) } : {})
      });
      response.setHeader('Cache-Control', 'no-store');
      response.json({ data: result.data, meta: meta(request, { nextCursor: result.nextCursor }) });
    } catch (error) { next(error); }
  };

  updateUnanswered = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const status = request.body?.status as UnansweredStatus;
      if (!unansweredStatuses.includes(status)) throw new AppError('status is invalid', 400, 'UNANSWERED_INPUT_INVALID');
      const id = requireUuid(request.params.unansweredId ?? '', 'unansweredId');
      const data = await this.operations.updateUnanswered(request.tenantContext!.tenantId, id,
        request.adminAuth!.id, { status,
          predictedCategoryId: uuidOrNull(request.body?.predictedCategoryId, 'predictedCategoryId'),
          resolvedKnowledgeItemId: uuidOrNull(request.body?.resolvedKnowledgeItemId, 'resolvedKnowledgeItemId'),
          reviewNote: text(request.body?.reviewNote, 'reviewNote', 2000, false) });
      await this.audit.record({ ...auditContext(request), action: 'ai.unanswered_updated',
        resourceType: 'unanswered_question', resourceId: id,
        afterState: { status: data.status, predictedCategoryId: data.predictedCategoryId } });
      response.json({ data, meta: meta(request) });
    } catch (error) { next(error); }
  };

  ignoreUnanswered = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      request.body = { status: 'ignored', reviewNote: text(request.body?.reason, 'reason', 1000)! };
      return this.updateUnanswered(request, response, next);
    } catch (error) { next(error); }
  };

  resolveUnanswered = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    request.body = { ...request.body, status: 'resolved' };
    return this.updateUnanswered(request, response, next);
  };

  createKnowledge = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const id = requireUuid(request.params.unansweredId ?? '', 'unansweredId');
      const data = await this.operations.createKnowledgeFromUnanswered(
        request.tenantContext!.tenantId, id, request.adminAuth!.id, {
          answer: text(request.body?.answer, 'answer', 20_000)!,
          categoryId: uuidOrNull(request.body?.categoryId, 'categoryId'),
          title: text(request.body?.title, 'title', 255, false) ?? undefined,
          requiresDisclaimer: bool(request.body?.requiresDisclaimer, 'requiresDisclaimer')
        }
      );
      await this.audit.record({ ...auditContext(request), action: 'ai.unanswered_knowledge_created',
        resourceType: 'unanswered_question', resourceId: id,
        afterState: { status: data.unanswered.status, knowledgeId: data.knowledge.id } });
      response.status(201).json({ data, meta: meta(request) });
    } catch (error) { next(error); }
  };

  listTestCases = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try { response.json({ data: await this.operations.listTestCases(request.tenantContext!.tenantId), meta: meta(request) }); }
    catch (error) { next(error); }
  };
  createTestCase = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.operations.createTestCase(request.tenantContext!.tenantId,
        request.adminAuth!.id, parseTestCase(request.body));
      await this.audit.record({ ...auditContext(request), action: 'ai.test_case_created',
        resourceType: 'ai_test_case', resourceId: data.id,
        afterState: { name: data.name, expectedCategory: data.expectedCategory } });
      response.status(201).json({ data, meta: meta(request) });
    } catch (error) { next(error); }
  };
  importTestCases = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!Array.isArray(request.body?.testCases) || request.body.testCases.length < 1 || request.body.testCases.length > 300) {
        throw new AppError('testCases must contain 1 to 300 items', 400, 'AI_EVALUATION_IMPORT_INVALID');
      }
      const parsed = request.body.testCases.map(parseTestCase);
      const data = await this.operations.importTestCases(request.tenantContext!.tenantId, request.adminAuth!.id, parsed);
      await this.audit.record({ ...auditContext(request), action: 'ai.test_cases_imported',
        resourceType: 'ai_test_case', resourceId: request.requestId, afterState: { imported: data.imported } });
      response.status(201).json({ data, meta: meta(request) });
    } catch (error) { next(error); }
  };
  updateTestCase = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.operations.updateTestCase(request.tenantContext!.tenantId,
        requireUuid(request.params.testCaseId ?? '', 'testCaseId'), request.adminAuth!.id,
        parseTestCase(request.body));
      response.json({ data, meta: meta(request) });
    } catch (error) { next(error); }
  };
  runTestCase = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.operations.runTestCase(request.tenantContext!.tenantId,
        requireUuid(request.params.testCaseId ?? '', 'testCaseId'), request.adminAuth!.id);
      response.json({ data, meta: meta(request) });
    } catch (error) { next(error); }
  };
  runBatch = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const ids = strings(request.body?.testCaseIds, 'testCaseIds', 100)
        .map((id) => requireUuid(id, 'testCaseIds'));
      const data = await this.operations.runBatch(request.tenantContext!.tenantId,
        request.adminAuth!.id, ids.length ? ids : undefined);
      await this.audit.record({ ...auditContext(request), action: 'ai.test_batch_run',
        resourceType: 'ai_test_case_batch', resourceId: request.requestId,
        afterState: { total: data.total, passed: data.passed, failed: data.failed } });
      response.json({ data, meta: meta(request) });
    } catch (error) { next(error); }
  };

  analytics = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const now = new Date();
      const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const from = dateTime(request.query.from, 'from') ?? defaultFrom;
      const to = dateTime(request.query.to, 'to') ?? now.toISOString();
      if (new Date(from) >= new Date(to) || new Date(to).getTime() - new Date(from).getTime() > 366 * 24 * 60 * 60 * 1000) {
        throw new AppError('Analytics range must be positive and at most 366 days', 400, 'AI_ANALYTICS_RANGE_INVALID');
      }
      const data = await this.operations.getAnalytics(request.tenantContext!.tenantId, from, to);
      response.setHeader('Cache-Control', 'private, max-age=30');
      response.json({ data, meta: meta(request) });
    } catch (error) { next(error); }
  };

  versionChanges = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try { response.json({ data: await this.operations.getVersionChanges(request.tenantContext!.tenantId), meta: meta(request) }); }
    catch (error) { next(error); }
  };

  getOperationalSettings = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try { response.json({ data: await this.operations.getOperationalSettings(request.tenantContext!.tenantId), meta: meta(request) }); }
    catch (error) { next(error); }
  };

  updateOperationalSettings = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const body = request.body ?? {};
      const data = await this.operations.updateOperationalSettings(request.tenantContext!.tenantId, request.adminAuth!.id, {
        logRetentionDays: boundedInteger(body.logRetentionDays, 'logRetentionDays', 1, 3650),
        cacheTtlSeconds: boundedInteger(body.cacheTtlSeconds, 'cacheTtlSeconds', 60, 86400),
        dailyBudgetUsd: boundedNumber(body.dailyBudgetUsd, 'dailyBudgetUsd', 0, 1_000_000, true),
        chatInputCostPerMillionUsd: boundedNumber(body.chatInputCostPerMillionUsd, 'chatInputCostPerMillionUsd', 0, 10_000, true),
        chatOutputCostPerMillionUsd: boundedNumber(body.chatOutputCostPerMillionUsd, 'chatOutputCostPerMillionUsd', 0, 10_000, true),
        embeddingCostPerMillionUsd: boundedNumber(body.embeddingCostPerMillionUsd, 'embeddingCostPerMillionUsd', 0, 10_000, true),
        fallbackAlertRate: boundedNumber(body.fallbackAlertRate, 'fallbackAlertRate', 0, 1)!,
        latencyAlertMs: boundedInteger(body.latencyAlertMs, 'latencyAlertMs', 100, 120_000),
        queueAlertDepth: boundedInteger(body.queueAlertDepth, 'queueAlertDepth', 1, 100_000),
        expectedRevision: boundedInteger(body.expectedRevision, 'expectedRevision', 1, Number.MAX_SAFE_INTEGER)
      });
      await this.audit.record({ ...auditContext(request), action: 'ai.operational_settings_updated',
        resourceType: 'ai_operational_settings', resourceId: request.tenantContext!.tenantId,
        afterState: { revision: data.revision, logRetentionDays: data.logRetentionDays, cacheTtlSeconds: data.cacheTtlSeconds } });
      response.json({ data, meta: meta(request) });
    } catch (error) { next(error); }
  };

  anonymizeConversation = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const id = requireUuid(request.params.conversationId ?? '', 'conversationId');
      const data = await this.operations.anonymizeConversation(request.tenantContext!.tenantId, id, request.adminAuth!.id);
      await this.audit.record({ ...auditContext(request), action: 'ai.conversation_anonymized',
        resourceType: 'ai_conversation', resourceId: id, afterState: { anonymizedAt: data.anonymizedAt } });
      response.json({ data, meta: meta(request) });
    } catch (error) { next(error); }
  };

  applyRetention = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.operations.applyRetention(request.tenantContext!.tenantId, request.adminAuth!.id);
      await this.audit.record({ ...auditContext(request), action: 'ai.retention_applied',
        resourceType: 'ai_conversation', resourceId: request.tenantContext!.tenantId, afterState: data });
      response.json({ data, meta: meta(request) });
    } catch (error) { next(error); }
  };

  releaseReadiness = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try { response.setHeader('Cache-Control', 'no-store'); response.json({ data: await this.operations.getReleaseReadiness(request.tenantContext!.tenantId), meta: meta(request) }); }
    catch (error) { next(error); }
  };

  generateEvaluationReport = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.operations.generateEvaluationReport(request.tenantContext!.tenantId, request.adminAuth!.id);
      await this.audit.record({ ...auditContext(request), action: 'ai.evaluation_report_generated',
        resourceType: 'ai_evaluation_report', resourceId: data.id,
        afterState: { datasetSize: data.datasetSize, gatePassed: data.gatePassed, criticalSafetyFailures: data.criticalSafetyFailures } });
      response.status(201).json({ data, meta: meta(request) });
    } catch (error) { next(error); }
  };

  updateReleaseGate = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const key = request.params.gateKey as ReleaseGateKey;
      if (!releaseGateKeys.includes(key)) throw new AppError('Release gate key is invalid', 400, 'AI_RELEASE_GATE_INVALID');
      const status = request.body?.status;
      if (!['pending', 'passed', 'failed'].includes(status)) throw new AppError('Release gate status is invalid', 400, 'AI_RELEASE_GATE_INVALID');
      const data = await this.operations.updateReleaseGate(request.tenantContext!.tenantId, request.adminAuth!.id, key, {
        status, evidence: text(request.body?.evidence, 'evidence', 2000)!,
        expectedRevision: boundedInteger(request.body?.expectedRevision, 'expectedRevision', 1, Number.MAX_SAFE_INTEGER)
      });
      await this.audit.record({ ...auditContext(request), action: 'ai.release_gate_updated',
        resourceType: 'ai_release_gate', resourceId: key, afterState: { status } });
      response.json({ data, meta: meta(request) });
    } catch (error) { next(error); }
  };

  updatePilotConfiguration = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const channels = strings(request.body?.channels, 'channels', 10);
      if (channels.some((channel) => !['whatsapp', 'internal'].includes(channel))) throw new AppError('Pilot channel is invalid', 400, 'AI_PILOT_CHANNEL_INVALID');
      const data = await this.operations.updatePilotConfiguration(request.tenantContext!.tenantId, request.adminAuth!.id, {
        percentage: boundedInteger(request.body?.percentage, 'percentage', 0, 100), channels,
        note: text(request.body?.note, 'note', 2000)!,
        expectedRevision: boundedInteger(request.body?.expectedRevision, 'expectedRevision', 1, Number.MAX_SAFE_INTEGER)
      });
      await this.audit.record({ ...auditContext(request), action: 'ai.pilot_configuration_updated',
        resourceType: 'ai_release_readiness', resourceId: request.tenantContext!.tenantId,
        afterState: { requestedPilotPercentage: data.requestedPilotPercentage, effectivePilotPercentage: data.effectivePilotPercentage } });
      response.json({ data, meta: meta(request) });
    } catch (error) { next(error); }
  };

  emergencyPausePilot = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const reason = text(request.body?.reason, 'reason', 1000)!;
      const data = await this.operations.emergencyPausePilot(request.tenantContext!.tenantId, request.adminAuth!.id, reason);
      await this.audit.record({ ...auditContext(request), action: 'ai.pilot_emergency_paused',
        resourceType: 'ai_release_readiness', resourceId: request.tenantContext!.tenantId,
        afterState: { effectivePilotPercentage: 0, reason } });
      response.json({ data, meta: meta(request) });
    } catch (error) { next(error); }
  };

  pilotDailyReview = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const date = typeof request.query.date === 'string' ? request.query.date : new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00.000Z`))) {
        throw new AppError('date must be YYYY-MM-DD', 400, 'AI_PILOT_DATE_INVALID');
      }
      response.json({ data: await this.operations.getPilotDailyReview(request.tenantContext!.tenantId, date), meta: meta(request) });
    } catch (error) { next(error); }
  };
}
