import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../middleware/error.middleware.js';
import { AuditService } from '../services/audit.service.js';
import { DocumentService, type DocumentStatus, type KnowledgeDocument } from '../services/document.service.js';
import { requireUuid } from '../services/ai-chatbot-validation.js';
import { env } from '../config/env.js';

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

const documentAudit = (document: KnowledgeDocument) => ({
  tenantId: document.tenantId,
  categoryId: document.categoryId,
  filename: document.filename,
  mimeType: document.mimeType,
  fileSize: document.fileSize,
  contentSha256: document.contentSha256,
  status: document.status,
  processingRevision: document.processingRevision,
  totalChunks: document.totalChunks,
  errorCode: document.errorCode
});

const statuses: DocumentStatus[] = [
  'uploaded', 'queued', 'extracting', 'cleaning', 'chunking',
  'embedding', 'ready', 'failed', 'archived'
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: env.AI_DOCUMENT_MAX_BYTES }
}).single('file');

export class AdminAiDocumentController {
  readonly uploadMiddleware = (
    request: Request,
    response: Response,
    next: NextFunction
  ): void => {
    upload(request, response, (error) => {
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        next(new AppError('Document exceeds the configured file-size limit', 413, 'DOCUMENT_TOO_LARGE'));
        return;
      }
      if (error) {
        next(new AppError('Document upload could not be parsed', 400, 'DOCUMENT_UPLOAD_INVALID'));
        return;
      }
      next();
    });
  };

  constructor(
    private readonly documents: DocumentService,
    private readonly audit: AuditService
  ) {}

  upload = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      if (!request.file) throw new AppError('Multipart field "file" is required', 400, 'DOCUMENT_FILE_REQUIRED');
      const categoryId = typeof request.body.categoryId === 'string' && request.body.categoryId
        ? requireUuid(request.body.categoryId, 'categoryId') : null;
      const document = await this.documents.upload(
        request.tenantContext!.tenantId,
        request.adminAuth!.id,
        categoryId,
        request.file
      );
      await this.audit.record({
        ...auditContext(request), action: 'ai.document_uploaded',
        resourceType: 'knowledge_document', resourceId: document.id,
        afterState: documentAudit(document)
      });
      response.status(201).json({ data: document, meta: meta(request) });
    } catch (error) { next(error); }
  };

  list = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = request.query.limit === undefined ? 20 : Number(request.query.limit);
      const offset = request.query.cursor === undefined ? 0 : Number(request.query.cursor);
      const query = request.query.query;
      const status = request.query.status;
      if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0) {
        throw new AppError('Document pagination is invalid', 400, 'DOCUMENT_FILTER_INVALID');
      }
      if (query !== undefined && (typeof query !== 'string' || query.length > 100)) {
        throw new AppError('Document query is invalid', 400, 'DOCUMENT_FILTER_INVALID');
      }
      if (status !== undefined && (typeof status !== 'string' || !statuses.includes(status as DocumentStatus))) {
        throw new AppError('Document status filter is invalid', 400, 'DOCUMENT_FILTER_INVALID');
      }
      const result = await this.documents.list(request.tenantContext!.tenantId, {
        limit, offset,
        ...(typeof query === 'string' && query.trim() ? { query: query.trim() } : {}),
        ...(typeof status === 'string' ? { status: status as DocumentStatus } : {})
      });
      response.json({ data: result.data, meta: meta(request, { nextCursor: result.nextCursor }) });
    } catch (error) { next(error); }
  };

  get = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.json({
        data: await this.documents.get(
          request.tenantContext!.tenantId,
          requireUuid(request.params.documentId ?? '', 'documentId')
        ),
        meta: meta(request)
      });
    } catch (error) { next(error); }
  };

  preview = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      response.setHeader('Cache-Control', 'no-store');
      response.json({
        data: await this.documents.preview(
          request.tenantContext!.tenantId,
          requireUuid(request.params.documentId ?? '', 'documentId')
        ),
        meta: meta(request)
      });
    } catch (error) { next(error); }
  };

  process = (reprocess: boolean) => async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const document = await this.documents.enqueueDocument(
        request.tenantContext!.tenantId,
        requireUuid(request.params.documentId ?? '', 'documentId'),
        request.requestId,
        reprocess
      );
      await this.audit.record({
        ...auditContext(request), action: reprocess ? 'ai.document_reprocess_queued' : 'ai.document_process_queued',
        resourceType: 'knowledge_document', resourceId: document.id,
        afterState: documentAudit(document)
      });
      response.status(202).json({ data: document, meta: meta(request) });
    } catch (error) { next(error); }
  };

  archive = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const document = await this.documents.archive(
        request.tenantContext!.tenantId,
        requireUuid(request.params.documentId ?? '', 'documentId')
      );
      await this.audit.record({
        ...auditContext(request), action: 'ai.document_archived',
        resourceType: 'knowledge_document', resourceId: document.id,
        afterState: documentAudit(document)
      });
      response.json({ data: document, meta: meta(request) });
    } catch (error) { next(error); }
  };

  delete = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const document = await this.documents.delete(
        request.tenantContext!.tenantId,
        requireUuid(request.params.documentId ?? '', 'documentId')
      );
      await this.audit.record({
        ...auditContext(request), action: 'ai.document_deleted',
        resourceType: 'knowledge_document', resourceId: document.id,
        beforeState: documentAudit(document)
      });
      response.status(204).end();
    } catch (error) { next(error); }
  };

  searchTest = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const query = request.body?.query;
      const limit = request.body?.limit ?? 5;
      if (typeof query !== 'string' || query.trim().length < 2 || query.length > 500) {
        throw new AppError('query must be between 2 and 500 characters', 400, 'SEARCH_TEST_INVALID');
      }
      if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
        throw new AppError('limit must be an integer between 1 and 10', 400, 'SEARCH_TEST_INVALID');
      }
      response.json({
        data: await this.documents.searchTest(request.tenantContext!.tenantId, query.trim(), limit),
        meta: meta(request)
      });
    } catch (error) { next(error); }
  };
}
