import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../middleware/error.middleware.js';
import { AuditService, recordAuditOutcome } from '../services/audit.service.js';
import {
  parseBulkKnowledgeAction,
  parseCategoryWrite,
  parseKnowledgeLifecycle,
  parseKnowledgeSourceType,
  parseKnowledgeStatus,
  parseKnowledgeUpdate,
  parseKnowledgeWrite
} from '../services/knowledge-validation.js';
import {
  KnowledgeService,
  type KnowledgeCategory,
  type KnowledgeItem
} from '../services/knowledge.service.js';
import { requireUuid } from '../services/ai-chatbot-validation.js';
import { DocumentService } from '../services/document.service.js';
import { logger } from '../utils/logger.js';
import { sanitizeOperationalError } from '../utils/sanitize.js';

const meta = (request: Request, extra: Record<string, unknown> = {}) => ({
  requestId: request.requestId,
  generatedAt: new Date().toISOString(),
  ...extra
});

const auditContext = (request: Request) => ({
  actorUserId: request.adminAuth!.id,
  requestId: request.requestId,
  ipAddress: request.ip,
  userAgent: request.get('user-agent')
});

const categoryAudit = (category: KnowledgeCategory) => ({
  tenantId: category.tenantId,
  name: category.name,
  slug: category.slug,
  active: category.active,
  sortOrder: category.sortOrder,
  revision: category.revision,
  knowledgeCount: category.knowledgeCount
});

const knowledgeAudit = (knowledge: KnowledgeItem) => ({
  tenantId: knowledge.tenantId,
  categoryId: knowledge.categoryId,
  sourceType: knowledge.sourceType,
  version: knowledge.version,
  revision: knowledge.revision,
  status: knowledge.status,
  title: knowledge.title,
  contentFingerprint: knowledge.contentFingerprint,
  requiresDisclaimer: knowledge.requiresDisclaimer,
  validFrom: knowledge.validFrom,
  validUntil: knowledge.validUntil
});

const queryBoolean = (value: unknown, field: string): boolean | undefined => {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new AppError(`${field} must be true or false`, 400, 'KNOWLEDGE_FILTER_INVALID', { field });
};

export class AdminAiKnowledgeController {
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly audit: AuditService,
    private readonly documents?: DocumentService
  ) {}

  private async updateIndex(
    request: Request,
    item: KnowledgeItem,
    action: 'publish' | 'archive'
  ): Promise<boolean> {
    if (!this.documents) return false;
    try {
      if (action === 'archive') {
        await this.documents.deactivateKnowledge(item.tenantId, item.id);
        return true;
      }
      return await this.documents.enqueueKnowledgeIndex({
        tenantId: item.tenantId,
        knowledgeItemId: item.id,
        knowledgeVersionId: item.versionId,
        traceId: request.requestId
      });
    } catch (error) {
      logger.error('Knowledge index synchronization failed', {
        tenantId: item.tenantId,
        knowledgeItemId: item.id,
        action,
        requestId: request.requestId,
        error: sanitizeOperationalError(error)
      });
      return false;
    }
  }

  listCategories = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.json({
        data: await this.knowledge.listCategories(request.tenantContext!.tenantId),
        meta: meta(request)
      });
    } catch (error) { next(error); }
  };

  createCategory = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const category = await this.knowledge.createCategory(
        request.tenantContext!.tenantId,
        parseCategoryWrite(request.body)
      );
      await this.audit.record({
        ...auditContext(request), action: 'ai.knowledge_category_created',
        resourceType: 'knowledge_category', resourceId: category.id,
        afterState: categoryAudit(category)
      });
      response.status(201).json({ data: category, meta: meta(request) });
    } catch (error) { next(error); }
  };

  updateCategory = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseCategoryWrite(request.body);
      if (!input.expectedRevision) {
        throw new AppError('expectedRevision is required', 400, 'KNOWLEDGE_REQUEST_INVALID');
      }
      const result = await this.knowledge.updateCategory(
        request.tenantContext!.tenantId,
        requireUuid(request.params.categoryId ?? '', 'categoryId'),
        input.expectedRevision,
        input
      );
      await recordAuditOutcome(this.audit, {
        ...auditContext(request), action: 'ai.knowledge_category_updated',
        resourceType: 'knowledge_category', resourceId: result.after.id,
        beforeState: categoryAudit(result.before), afterState: categoryAudit(result.after)
      });
      response.json({ data: result.after, meta: meta(request) });
    } catch (error) { next(error); }
  };

  deleteCategory = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const category = await this.knowledge.deleteCategory(
        request.tenantContext!.tenantId,
        requireUuid(request.params.categoryId ?? '', 'categoryId')
      );
      await this.audit.record({
        ...auditContext(request), action: 'ai.knowledge_category_deleted',
        resourceType: 'knowledge_category', resourceId: category.id,
        beforeState: categoryAudit(category)
      });
      response.status(204).end();
    } catch (error) { next(error); }
  };

  listKnowledge = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = request.query.limit === undefined ? 20 : Number(request.query.limit);
      const offset = request.query.cursor === undefined ? 0 : Number(request.query.cursor);
      const query = request.query.query;
      if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0 || (query !== undefined && (typeof query !== 'string' || query.length > 100))) {
        throw new AppError('Knowledge pagination or query is invalid', 400, 'KNOWLEDGE_FILTER_INVALID');
      }
      const categoryId = request.query.categoryId === undefined
        ? undefined
        : requireUuid(String(request.query.categoryId), 'categoryId');
      const result = await this.knowledge.listKnowledge(request.tenantContext!.tenantId, {
        limit,
        offset,
        ...(typeof query === 'string' && query.trim() ? { query: query.trim() } : {}),
        ...(parseKnowledgeStatus(request.query.status) ? { status: parseKnowledgeStatus(request.query.status) } : {}),
        ...(parseKnowledgeSourceType(request.query.sourceType) ? { sourceType: parseKnowledgeSourceType(request.query.sourceType) } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(queryBoolean(request.query.expired, 'expired') === undefined ? {} : { expired: queryBoolean(request.query.expired, 'expired') }),
        ...(queryBoolean(request.query.requiresDisclaimer, 'requiresDisclaimer') === undefined ? {} : { requiresDisclaimer: queryBoolean(request.query.requiresDisclaimer, 'requiresDisclaimer') })
      });
      response.json({ data: result.data, meta: meta(request, { nextCursor: result.nextCursor }) });
    } catch (error) { next(error); }
  };

  getKnowledge = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.json({
        data: await this.knowledge.getKnowledge(
          request.tenantContext!.tenantId,
          requireUuid(request.params.knowledgeId ?? '', 'knowledgeId')
        ),
        meta: meta(request)
      });
    } catch (error) { next(error); }
  };

  createKnowledge = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const item = await this.knowledge.createKnowledge(
        request.tenantContext!.tenantId,
        request.adminAuth!.id,
        parseKnowledgeWrite(request.body)
      );
      await this.audit.record({
        ...auditContext(request), action: 'ai.knowledge_created',
        resourceType: 'knowledge_item', resourceId: item.id,
        afterState: knowledgeAudit(item)
      });
      response.status(201).json({ data: item, meta: meta(request) });
    } catch (error) { next(error); }
  };

  updateKnowledge = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseKnowledgeUpdate(request.body);
      const result = await this.knowledge.updateKnowledge(
        request.tenantContext!.tenantId,
        requireUuid(request.params.knowledgeId ?? '', 'knowledgeId'),
        request.adminAuth!.id,
        input.expectedVersion,
        input.expectedRevision,
        input.knowledge
      );
      await recordAuditOutcome(this.audit, {
        ...auditContext(request),
        action: result.createdVersion ? 'ai.knowledge_version_created' : 'ai.knowledge_updated',
        resourceType: 'knowledge_item', resourceId: result.after.id,
        beforeState: knowledgeAudit(result.before), afterState: knowledgeAudit(result.after)
      });
      response.json({ data: result.after, meta: meta(request) });
    } catch (error) { next(error); }
  };

  deleteKnowledge = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const item = await this.knowledge.deleteDraft(
        request.tenantContext!.tenantId,
        requireUuid(request.params.knowledgeId ?? '', 'knowledgeId')
      );
      await this.audit.record({
        ...auditContext(request), action: 'ai.knowledge_draft_deleted',
        resourceType: 'knowledge_item', resourceId: item.id,
        beforeState: knowledgeAudit(item)
      });
      response.status(204).end();
    } catch (error) { next(error); }
  };

  transition = (action: 'submit_review' | 'request_revision' | 'approve' | 'publish' | 'archive') =>
    async (request: Request, response: Response, next: NextFunction): Promise<void> => {
      try {
        const input = parseKnowledgeLifecycle(request.body);
        const result = await this.knowledge.transitionKnowledge(
          request.tenantContext!.tenantId,
          requireUuid(request.params.knowledgeId ?? '', 'knowledgeId'),
          request.adminAuth!.id,
          input.expectedVersion,
          input.expectedRevision,
          action,
          input.reason
        );
        await this.audit.record({
          ...auditContext(request), action: `ai.knowledge_${action}`,
          resourceType: 'knowledge_item', resourceId: result.after.id,
          reason: input.reason, beforeState: knowledgeAudit(result.before),
          afterState: knowledgeAudit(result.after)
        });
        const indexingQueued = action === 'publish' || action === 'archive'
          ? await this.updateIndex(request, result.after, action)
          : undefined;
        response.json({
          data: result.after,
          meta: meta(request, indexingQueued === undefined ? {} : { indexingQueued })
        });
      } catch (error) { next(error); }
    };

  bulkAction = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseBulkKnowledgeAction(request.body);
      const items = await this.knowledge.bulkAction(
        request.tenantContext!.tenantId,
        input.itemIds,
        request.adminAuth!.id,
        input.action,
        input.reason
      );
      await this.audit.record({
        ...auditContext(request), action: `ai.knowledge_bulk_${input.action}`,
        resourceType: 'knowledge_item', reason: input.reason,
        afterState: { tenantId: request.tenantContext!.tenantId, itemIds: items.map((item) => item.id), count: items.length }
      });
      const indexResults = await Promise.all(items.map((item) =>
        this.updateIndex(request, item, input.action)
      ));
      response.json({
        data: items,
        meta: meta(request, { indexingQueued: indexResults.every(Boolean) })
      });
    } catch (error) { next(error); }
  };

  reindex = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!this.documents) throw new AppError('Knowledge indexing is unavailable', 503, 'KNOWLEDGE_INDEX_UNAVAILABLE');
      const knowledgeId = requireUuid(request.params.knowledgeId ?? '', 'knowledgeId');
      const queued = await this.documents.enqueueCurrentPublishedKnowledge(
        request.tenantContext!.tenantId,
        knowledgeId,
        request.requestId
      );
      await this.audit.record({
        ...auditContext(request), action: 'ai.knowledge_reindex_queued',
        resourceType: 'knowledge_item', resourceId: knowledgeId,
        afterState: { tenantId: request.tenantContext!.tenantId, queued }
      });
      response.status(202).json({ data: { knowledgeId, queued }, meta: meta(request) });
    } catch (error) { next(error); }
  };
}
