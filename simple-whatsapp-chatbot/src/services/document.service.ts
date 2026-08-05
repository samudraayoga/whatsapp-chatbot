import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../middleware/error.middleware.js';
import { pool } from '../database/connection.js';
import type { QueryExecutor } from './message.service.js';
import type { DocumentObjectStorage } from './document-storage.service.js';
import { DisabledDocumentObjectStorage } from './document-storage.service.js';
import type { DocumentProcessingJob, ProcessingQueue } from './document-queue.service.js';
import { DisabledProcessingQueue } from './document-queue.service.js';
import {
  chunkDocumentText,
  cleanExtractedText,
  estimateTokenCount,
  extractDocumentText,
  validateDocumentFile,
  type MalwareScanner,
  type ValidatedDocumentFile
} from './document-processing-utils.js';
import { AiProviderRegistry } from './ai-provider.service.js';
import type { EmbeddingProvider } from './ai-provider.service.js';
import { sanitizeOperationalError } from '../utils/sanitize.js';

export type DocumentStatus =
  | 'uploaded' | 'queued' | 'extracting' | 'cleaning' | 'chunking'
  | 'embedding' | 'ready' | 'failed' | 'archived';

export type KnowledgeDocument = {
  id: string;
  tenantId: string;
  categoryId: string | null;
  categoryName: string | null;
  filename: string;
  mimeType: string;
  extension: string;
  fileSize: number;
  contentSha256: string;
  status: DocumentStatus;
  processingRevision: number;
  attemptCount: number;
  extractedCharacterCount: number;
  pageCount: number | null;
  totalChunks: number;
  errorCode: string | null;
  errorMessage: string | null;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
};

export type KnowledgeChunkPreview = {
  id: string;
  chunkIndex: number;
  title: string | null;
  section: string | null;
  content: string;
  tokenCount: number;
  status: 'active' | 'inactive' | 'failed';
  embeddingModel: string;
  metadata: Record<string, unknown>;
};

type DocumentRow = {
  id: string; tenant_id: string; category_id: string | null; category_name: string | null;
  original_filename: string; mime_type: string; file_extension: string; file_size: string | number;
  content_sha256: string; processing_status: DocumentStatus; processing_revision: number;
  attempt_count: number; extracted_character_count: number; page_count: number | null;
  total_chunks: number; safe_error_code: string | null; safe_error_message: string | null;
  uploaded_by: string; uploaded_by_name: string; created_at: Date | string;
  updated_at: Date | string; processed_at: Date | string | null; object_key?: string;
  extraction_preview?: string | null;
};

type IntegrationRow = {
  embedding_provider: string | null;
  embedding_model: string | null;
  secret_ref: string | null;
  timeout_ms: number;
};

type DatabaseWithTransactions = QueryExecutor & {
  connect: () => Promise<QueryExecutor & { release: () => void }>;
};

const hasTransactions = (database: QueryExecutor): database is DatabaseWithTransactions =>
  'connect' in database && typeof database.connect === 'function';

const iso = (value: Date | string): string => new Date(value).toISOString();
const nullableIso = (value: Date | string | null): string | null => value ? iso(value) : null;
const recordValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const toDocument = (row: DocumentRow): KnowledgeDocument => ({
  id: row.id,
  tenantId: row.tenant_id,
  categoryId: row.category_id,
  categoryName: row.category_name,
  filename: row.original_filename,
  mimeType: row.mime_type,
  extension: row.file_extension,
  fileSize: Number(row.file_size),
  contentSha256: row.content_sha256,
  status: row.processing_status,
  processingRevision: row.processing_revision,
  attemptCount: row.attempt_count,
  extractedCharacterCount: row.extracted_character_count,
  pageCount: row.page_count,
  totalChunks: row.total_chunks,
  errorCode: row.safe_error_code,
  errorMessage: row.safe_error_message,
  uploadedBy: row.uploaded_by,
  uploadedByName: row.uploaded_by_name,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
  processedAt: nullableIso(row.processed_at)
});

const documentSelect = `
  SELECT document.*, category.name AS category_name,
    uploader.display_name AS uploaded_by_name
  FROM knowledge_documents document
  LEFT JOIN knowledge_categories category
    ON category.tenant_id = document.tenant_id AND category.id = document.category_id
  INNER JOIN admin_users uploader ON uploader.id = document.uploaded_by
`;

const vectorLiteral = (embedding: number[]): string => {
  if (!embedding.length || embedding.some((value) => !Number.isFinite(value))) {
    throw new AppError('Embedding provider returned an invalid vector', 502, 'EMBEDDING_VECTOR_INVALID');
  }
  return `[${embedding.join(',')}]`;
};

const embedInBatches = async (
  provider: EmbeddingProvider,
  model: string,
  inputs: string[],
  options: { secretReference: string | null; timeoutMs: number },
  batchSize = 64
): Promise<number[][]> => {
  const embeddings: number[][] = [];
  for (let offset = 0; offset < inputs.length; offset += batchSize) {
    const batch = inputs.slice(offset, offset + batchSize);
    const result = await provider.embed(model, batch, options);
    if (result.length !== batch.length) {
      throw new AppError('Embedding count does not match chunk count', 502, 'EMBEDDING_COUNT_MISMATCH');
    }
    embeddings.push(...result);
  }
  return embeddings;
};

export class DocumentService {
  constructor(
    private readonly database: QueryExecutor = pool,
    private readonly storage: DocumentObjectStorage = new DisabledDocumentObjectStorage(),
    private readonly queue: ProcessingQueue = new DisabledProcessingQueue(),
    private readonly providers = new AiProviderRegistry(),
    private readonly maxFileBytes = 10 * 1024 * 1024,
    private readonly malwareScanner?: MalwareScanner
  ) {}

  private async transaction<T>(callback: (database: QueryExecutor) => Promise<T>): Promise<T> {
    if (!hasTransactions(this.database)) return callback(this.database);
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async integration(tenantId: string): Promise<{
    providerId: string;
    model: string;
    version: string;
    secretReference: string | null;
    timeoutMs: number;
  }> {
    const result = await this.database.query<IntegrationRow>(
      `SELECT embedding_provider, embedding_model, secret_ref, timeout_ms
       FROM ai_integrations WHERE tenant_id = $1;`,
      [tenantId]
    );
    const row = result.rows[0];
    if (!row?.embedding_provider || !row.embedding_model) {
      throw new AppError('Embedding provider and model are not configured', 409, 'EMBEDDING_NOT_CONFIGURED');
    }
    if (!this.providers.getEmbeddingProvider(row.embedding_provider)) {
      throw new AppError('Configured embedding provider is unavailable', 503, 'EMBEDDING_PROVIDER_UNAVAILABLE');
    }
    return {
      providerId: row.embedding_provider,
      model: row.embedding_model,
      version: `${row.embedding_provider}:${row.embedding_model}`,
      secretReference: row.secret_ref,
      timeoutMs: row.timeout_ms
    };
  }

  async upload(
    tenantId: string,
    actorId: string,
    categoryId: string | null,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer }
  ): Promise<KnowledgeDocument> {
    if (!this.storage.available) {
      throw new AppError('Document object storage is not configured', 503, 'DOCUMENT_STORAGE_UNAVAILABLE');
    }
    const validated = await validateDocumentFile(file, this.maxFileBytes, this.malwareScanner);
    if (categoryId) {
      const category = await this.database.query(
        'SELECT 1 FROM knowledge_categories WHERE tenant_id = $1 AND id = $2 AND is_active = TRUE;',
        [tenantId, categoryId]
      );
      if (!category.rows[0]) throw new AppError('Active category was not found for this tenant', 400, 'DOCUMENT_CATEGORY_INVALID');
    }
    const id = randomUUID();
    const objectKey = `tenants/${tenantId}/documents/${id}/${validated.sanitizedFilename}`;
    await this.storage.put(objectKey, validated.buffer, validated.mimeType);
    try {
      const result = await this.database.query<DocumentRow>(
        `INSERT INTO knowledge_documents (
          id, tenant_id, category_id, original_filename, sanitized_filename,
          object_key, mime_type, file_extension, file_size, content_sha256, uploaded_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *, NULL::text AS category_name,
          (SELECT display_name FROM admin_users WHERE id = $11) AS uploaded_by_name;`,
        [id, tenantId, categoryId, validated.originalFilename, validated.sanitizedFilename,
          objectKey, validated.mimeType, validated.extension, validated.size, validated.sha256, actorId]
      );
      return toDocument(result.rows[0]!);
    } catch (error) {
      await this.storage.delete(objectKey).catch(() => undefined);
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        throw new AppError('An identical document already exists for this tenant', 409, 'DOCUMENT_DUPLICATE');
      }
      throw error;
    }
  }

  async list(tenantId: string, filter: {
    limit: number; offset: number; status?: DocumentStatus; query?: string;
  }): Promise<{ data: KnowledgeDocument[]; nextCursor: string | null }> {
    const values: unknown[] = [tenantId];
    const clauses = ['document.tenant_id = $1'];
    if (filter.status) {
      values.push(filter.status);
      clauses.push(`document.processing_status = $${values.length}`);
    }
    if (filter.query) {
      values.push(filter.query);
      clauses.push(`document.original_filename ILIKE '%' || $${values.length} || '%'`);
    }
    values.push(filter.limit + 1, filter.offset);
    const result = await this.database.query<DocumentRow>(
      `${documentSelect} WHERE ${clauses.join(' AND ')}
       ORDER BY document.updated_at DESC, document.id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length};`,
      values
    );
    const hasMore = result.rows.length > filter.limit;
    return {
      data: result.rows.slice(0, filter.limit).map(toDocument),
      nextCursor: hasMore ? String(filter.offset + filter.limit) : null
    };
  }

  async get(tenantId: string, documentId: string): Promise<KnowledgeDocument> {
    const result = await this.database.query<DocumentRow>(
      `${documentSelect} WHERE document.tenant_id = $1 AND document.id = $2;`,
      [tenantId, documentId]
    );
    if (!result.rows[0]) throw new AppError('Document was not found', 404, 'DOCUMENT_NOT_FOUND');
    return toDocument(result.rows[0]);
  }

  async preview(tenantId: string, documentId: string): Promise<{
    document: KnowledgeDocument;
    extractionPreview: string | null;
    chunks: KnowledgeChunkPreview[];
  }> {
    const result = await this.database.query<DocumentRow>(
      `${documentSelect} WHERE document.tenant_id = $1 AND document.id = $2;`,
      [tenantId, documentId]
    );
    const row = result.rows[0];
    if (!row) throw new AppError('Document was not found', 404, 'DOCUMENT_NOT_FOUND');
    const chunks = await this.database.query<{
      id: string; chunk_index: number; title: string | null; section: string | null;
      content: string; token_count: number; status: 'active' | 'inactive' | 'failed';
      embedding_model: string; metadata: unknown;
    }>(
      `SELECT id, chunk_index, title, section, content, token_count, status,
        embedding_model, metadata FROM knowledge_chunks
       WHERE tenant_id = $1 AND document_id = $2 ORDER BY chunk_index LIMIT 10;`,
      [tenantId, documentId]
    );
    return {
      document: toDocument(row),
      extractionPreview: row.extraction_preview ?? null,
      chunks: chunks.rows.map((chunk) => ({
        id: chunk.id, chunkIndex: chunk.chunk_index, title: chunk.title,
        section: chunk.section, content: chunk.content, tokenCount: chunk.token_count,
        status: chunk.status, embeddingModel: chunk.embedding_model,
        metadata: recordValue(chunk.metadata)
      }))
    };
  }

  async enqueueDocument(
    tenantId: string,
    documentId: string,
    traceId: string,
    reprocess: boolean
  ): Promise<KnowledgeDocument> {
    if (!this.queue.available) throw new AppError('Document processing queue is unavailable', 503, 'DOCUMENT_QUEUE_UNAVAILABLE');
    const allowed = reprocess ? ['ready', 'failed'] : ['uploaded', 'failed'];
    const result = await this.database.query<DocumentRow>(
      `${documentSelect}
       WHERE document.tenant_id = $1 AND document.id = $2;`,
      [tenantId, documentId]
    );
    const current = result.rows[0];
    if (!current) throw new AppError('Document was not found', 404, 'DOCUMENT_NOT_FOUND');
    if (!allowed.includes(current.processing_status)) {
      throw new AppError('Document cannot be queued from its current status', 409, 'DOCUMENT_PROCESSING_CONFLICT');
    }
    const queued = await this.database.query<DocumentRow>(
      `UPDATE knowledge_documents SET processing_status = 'queued',
        processing_revision = processing_revision + 1, safe_error_code = NULL,
        safe_error_message = NULL, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND processing_status = $3
       RETURNING *, NULL::text AS category_name,
         (SELECT display_name FROM admin_users WHERE id = uploaded_by) AS uploaded_by_name;`,
      [tenantId, documentId, current.processing_status]
    );
    const document = queued.rows[0];
    if (!document) throw new AppError('Document status changed while queueing', 409, 'DOCUMENT_PROCESSING_CONFLICT');
    try {
      await this.queue.enqueue({
        kind: 'document', tenantId, documentId,
        processingRevision: document.processing_revision, traceId
      });
    } catch (error) {
      await this.database.query(
        `UPDATE knowledge_documents SET processing_status = 'failed',
          safe_error_code = 'DOCUMENT_QUEUE_FAILED',
          safe_error_message = 'Processing queue could not accept the document', updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2 AND processing_revision = $3;`,
        [tenantId, documentId, document.processing_revision]
      );
      throw new AppError('Processing queue could not accept the document', 503, 'DOCUMENT_QUEUE_FAILED');
    }
    return toDocument(document);
  }

  async archive(tenantId: string, documentId: string): Promise<KnowledgeDocument> {
    return this.transaction(async (database) => {
      const result = await database.query<DocumentRow>(
        `UPDATE knowledge_documents SET processing_status = 'archived', updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2
           AND processing_status IN ('ready', 'failed', 'uploaded')
         RETURNING *, NULL::text AS category_name,
           (SELECT display_name FROM admin_users WHERE id = uploaded_by) AS uploaded_by_name;`,
        [tenantId, documentId]
      );
      if (!result.rows[0]) {
        const exists = await database.query(
          'SELECT 1 FROM knowledge_documents WHERE tenant_id = $1 AND id = $2;',
          [tenantId, documentId]
        );
        if (!exists.rows[0]) throw new AppError('Document was not found', 404, 'DOCUMENT_NOT_FOUND');
        throw new AppError('Document cannot be archived from its current status', 409, 'DOCUMENT_ARCHIVE_CONFLICT');
      }
      await database.query(
        `UPDATE knowledge_chunks SET status = 'inactive', updated_at = NOW()
         WHERE tenant_id = $1 AND document_id = $2;`,
        [tenantId, documentId]
      );
      return toDocument(result.rows[0]);
    });
  }

  async delete(tenantId: string, documentId: string): Promise<KnowledgeDocument> {
    const result = await this.database.query<DocumentRow>(
      `${documentSelect} WHERE document.tenant_id = $1 AND document.id = $2;`,
      [tenantId, documentId]
    );
    const row = result.rows[0];
    if (!row) throw new AppError('Document was not found', 404, 'DOCUMENT_NOT_FOUND');
    if (!['uploaded', 'failed', 'archived'].includes(row.processing_status)) {
      throw new AppError('Ready or processing documents must be archived before deletion', 409, 'DOCUMENT_DELETE_CONFLICT');
    }
    await this.storage.delete(row.object_key!);
    await this.database.query('DELETE FROM knowledge_documents WHERE tenant_id = $1 AND id = $2;', [tenantId, documentId]);
    return toDocument(row);
  }

  private async updateStage(
    tenantId: string,
    documentId: string,
    revision: number,
    status: DocumentStatus,
    incrementAttempt = false
  ): Promise<void> {
    const result = await this.database.query(
      `UPDATE knowledge_documents SET processing_status = $4,
        attempt_count = attempt_count + CASE WHEN $5::boolean THEN 1 ELSE 0 END,
        updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND processing_revision = $3
         AND processing_status <> 'archived' RETURNING id;`,
      [tenantId, documentId, revision, status, incrementAttempt]
    );
    if (!result.rows[0]) throw new AppError('Document processing revision is stale', 409, 'DOCUMENT_PROCESSING_STALE');
  }

  async processJob(job: DocumentProcessingJob, attempt: number): Promise<void> {
    try {
      if (job.kind === 'knowledge') {
        await this.indexKnowledge(job);
        return;
      }
      await this.processDocument(job, attempt);
    } catch (error) {
      if (job.kind === 'document') {
        await this.database.query(
          `UPDATE knowledge_documents SET processing_status = 'failed',
            safe_error_code = $4, safe_error_message = $5, updated_at = NOW()
           WHERE tenant_id = $1 AND id = $2 AND processing_revision = $3
             AND processing_status <> 'archived';`,
          [job.tenantId, job.documentId, job.processingRevision,
            error instanceof AppError ? error.code : 'DOCUMENT_PROCESSING_FAILED',
            sanitizeOperationalError(error, 'Document processing failed')]
        );
      }
      throw error;
    }
  }

  private async processDocument(
    job: Extract<DocumentProcessingJob, { kind: 'document' }>,
    _attempt: number
  ): Promise<void> {
    await this.updateStage(job.tenantId, job.documentId, job.processingRevision, 'extracting', true);
    const rowResult = await this.database.query<DocumentRow>(
      `SELECT document.*, NULL::text AS category_name,
        (SELECT display_name FROM admin_users WHERE id = document.uploaded_by) AS uploaded_by_name
       FROM knowledge_documents document
       WHERE tenant_id = $1 AND id = $2 AND processing_revision = $3;`,
      [job.tenantId, job.documentId, job.processingRevision]
    );
    const document = rowResult.rows[0];
    if (!document?.object_key) throw new AppError('Document was not found for processing', 404, 'DOCUMENT_NOT_FOUND');
    const body = await this.storage.get(document.object_key);
    const extracted = await extractDocumentText(body, document.file_extension as ValidatedDocumentFile['extension']);
    await this.updateStage(job.tenantId, job.documentId, job.processingRevision, 'cleaning');
    const text = cleanExtractedText(extracted.text);
    await this.updateStage(job.tenantId, job.documentId, job.processingRevision, 'chunking');
    const chunks = chunkDocumentText(text);
    if (!chunks.length) throw new AppError('Document produced no chunks', 422, 'DOCUMENT_CHUNKING_EMPTY');
    await this.updateStage(job.tenantId, job.documentId, job.processingRevision, 'embedding');
    const integration = await this.integration(job.tenantId);
    const provider = this.providers.getEmbeddingProvider(integration.providerId)!;
    const embeddings = await embedInBatches(
      provider,
      integration.model,
      chunks.map((chunk) => chunk.content),
      { secretReference: integration.secretReference, timeoutMs: integration.timeoutMs }
    );
    const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0);
    await this.transaction(async (database) => {
      const lock = await database.query(
        `SELECT 1 FROM knowledge_documents WHERE tenant_id = $1 AND id = $2
          AND processing_revision = $3 AND processing_status = 'embedding' FOR UPDATE;`,
        [job.tenantId, job.documentId, job.processingRevision]
      );
      if (!lock.rows[0]) throw new AppError('Document processing revision is stale', 409, 'DOCUMENT_PROCESSING_STALE');
      await database.query('DELETE FROM knowledge_chunks WHERE tenant_id = $1 AND document_id = $2;', [job.tenantId, job.documentId]);
      for (const [index, chunk] of chunks.entries()) {
        await database.query(
          `INSERT INTO knowledge_chunks (
            id, tenant_id, document_id, category_id, chunk_index, title, section,
            content, content_sha256, embedding, embedding_model, embedding_version,
            token_count, metadata, status
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector,$11,$12,$13,$14::jsonb,'active');`,
          [randomUUID(), job.tenantId, job.documentId, document.category_id, index,
            document.original_filename, chunk.section, chunk.content,
            createHash('sha256').update(chunk.content).digest('hex'), vectorLiteral(embeddings[index]!),
            integration.model, integration.version, chunk.tokenCount,
            JSON.stringify({ sourceType: 'document', filename: document.original_filename,
              documentId: job.documentId, processingRevision: job.processingRevision, section: chunk.section })]
        );
      }
      await database.query(
        `INSERT INTO ai_embedding_usage_logs (
          tenant_id, document_id, embedding_model, embedding_version,
          input_count, token_count, trace_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7);`,
        [job.tenantId, job.documentId, integration.model, integration.version,
          chunks.length, totalTokens, job.traceId]
      );
      await database.query(
        `UPDATE knowledge_documents SET processing_status = 'ready',
          extraction_preview = $4, extracted_character_count = $5,
          page_count = $6, total_chunks = $7, safe_error_code = NULL,
          safe_error_message = NULL, processed_at = NOW(), updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2 AND processing_revision = $3;`,
        [job.tenantId, job.documentId, job.processingRevision,
          text.slice(0, 10_000), text.length, extracted.pageCount, chunks.length]
      );
    });
  }

  async enqueueKnowledgeIndex(input: {
    tenantId: string; knowledgeItemId: string; knowledgeVersionId: string; traceId: string;
  }): Promise<boolean> {
    if (!this.queue.available) return false;
    await this.queue.enqueue({ kind: 'knowledge', ...input });
    return true;
  }

  async enqueueCurrentPublishedKnowledge(
    tenantId: string,
    knowledgeItemId: string,
    traceId: string
  ): Promise<boolean> {
    const result = await this.database.query<{ published_version_id: string | null }>(
      `SELECT published_version_id FROM knowledge_items WHERE tenant_id = $1 AND id = $2;`,
      [tenantId, knowledgeItemId]
    );
    if (!result.rows[0]) throw new AppError('Knowledge item was not found', 404, 'KNOWLEDGE_NOT_FOUND');
    if (!result.rows[0].published_version_id) {
      throw new AppError('Knowledge item has no published version to index', 409, 'KNOWLEDGE_NOT_PUBLISHED');
    }
    return this.enqueueKnowledgeIndex({
      tenantId,
      knowledgeItemId,
      knowledgeVersionId: result.rows[0].published_version_id,
      traceId
    });
  }

  async deactivateKnowledge(tenantId: string, knowledgeItemId: string): Promise<void> {
    await this.database.query(
      `UPDATE knowledge_chunks chunk SET status = 'inactive', updated_at = NOW()
       FROM knowledge_item_versions version
       WHERE chunk.tenant_id = $1 AND version.tenant_id = chunk.tenant_id
         AND version.id = chunk.knowledge_item_version_id
         AND version.knowledge_item_id = $2;`,
      [tenantId, knowledgeItemId]
    );
  }

  private async indexKnowledge(job: Extract<DocumentProcessingJob, { kind: 'knowledge' }>): Promise<void> {
    const result = await this.database.query<{
      version_id: string; item_id: string; category_id: string | null; source_type: string;
      title: string; question: string | null; content: string; requires_disclaimer: boolean;
      priority: number; valid_from: Date | string | null; valid_until: Date | string | null;
      variants: unknown;
    }>(
      `SELECT version.id AS version_id, item.id AS item_id, item.category_id,
        item.source_type, version.title, version.question, version.content,
        version.requires_disclaimer, version.priority, version.valid_from,
        version.valid_until, COALESCE(jsonb_agg(variant.question)
          FILTER (WHERE variant.id IS NOT NULL), '[]'::jsonb) AS variants
       FROM knowledge_items item
       INNER JOIN knowledge_item_versions version
         ON version.tenant_id = item.tenant_id AND version.id = item.published_version_id
       LEFT JOIN knowledge_question_variants variant
         ON variant.tenant_id = version.tenant_id AND variant.knowledge_item_version_id = version.id
       WHERE item.tenant_id = $1 AND item.id = $2 AND version.id = $3
         AND version.status = 'published'
         AND (version.valid_from IS NULL OR version.valid_from <= NOW())
         AND (version.valid_until IS NULL OR version.valid_until > NOW())
       GROUP BY version.id, item.id;`,
      [job.tenantId, job.knowledgeItemId, job.knowledgeVersionId]
    );
    const source = result.rows[0];
    if (!source) {
      await this.deactivateKnowledge(job.tenantId, job.knowledgeItemId);
      return;
    }
    const variants = Array.isArray(source.variants)
      ? source.variants.filter((value): value is string => typeof value === 'string') : [];
    const combined = [source.question, ...variants, source.content].filter(Boolean).join('\n\n');
    const chunks = source.source_type === 'faq' && estimateTokenCount(combined) <= 600
      ? [{ content: combined, section: null, tokenCount: estimateTokenCount(combined) }]
      : chunkDocumentText(combined);
    const integration = await this.integration(job.tenantId);
    const provider = this.providers.getEmbeddingProvider(integration.providerId)!;
    const embeddings = await embedInBatches(
      provider,
      integration.model,
      chunks.map((chunk) => chunk.content),
      { secretReference: integration.secretReference, timeoutMs: integration.timeoutMs }
    );
    await this.transaction(async (database) => {
      await database.query(
        `UPDATE knowledge_chunks chunk SET status = 'inactive', updated_at = NOW()
         FROM knowledge_item_versions version
         WHERE chunk.tenant_id = $1 AND version.tenant_id = chunk.tenant_id
           AND version.id = chunk.knowledge_item_version_id
           AND version.knowledge_item_id = $2;`,
        [job.tenantId, job.knowledgeItemId]
      );
      await database.query('DELETE FROM knowledge_chunks WHERE tenant_id = $1 AND knowledge_item_version_id = $2;', [job.tenantId, job.knowledgeVersionId]);
      for (const [index, chunk] of chunks.entries()) {
        await database.query(
          `INSERT INTO knowledge_chunks (
            id, tenant_id, knowledge_item_version_id, category_id, chunk_index,
            title, section, content, content_sha256, embedding, embedding_model,
            embedding_version, token_count, metadata, status
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector,$11,$12,$13,$14::jsonb,'active');`,
          [randomUUID(), job.tenantId, job.knowledgeVersionId, source.category_id,
            index, source.title, chunk.section, chunk.content,
            createHash('sha256').update(chunk.content).digest('hex'), vectorLiteral(embeddings[index]!),
            integration.model, integration.version, chunk.tokenCount,
            JSON.stringify({ sourceType: source.source_type, knowledgeItemId: source.item_id,
              knowledgeVersionId: source.version_id, requiresDisclaimer: source.requires_disclaimer,
              priority: source.priority, validFrom: source.valid_from, validUntil: source.valid_until })]
        );
      }
      await database.query(
        `INSERT INTO ai_embedding_usage_logs (
          tenant_id, knowledge_item_version_id, embedding_model, embedding_version,
          input_count, token_count, trace_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7);`,
        [job.tenantId, job.knowledgeVersionId, integration.model, integration.version,
          chunks.length, chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0), job.traceId]
      );
    });
  }

  async searchTest(tenantId: string, query: string, limit: number): Promise<Array<{
    chunkId: string; title: string | null; section: string | null; content: string;
    score: number; sourceType: string; documentId: string | null; knowledgeVersionId: string | null;
  }>> {
    const integration = await this.integration(tenantId);
    const provider = this.providers.getEmbeddingProvider(integration.providerId)!;
    const [embedding] = await provider.embed(integration.model, [query], {
      secretReference: integration.secretReference,
      timeoutMs: integration.timeoutMs
    });
    if (!embedding) throw new AppError('Embedding provider returned no query vector', 502, 'EMBEDDING_VECTOR_INVALID');
    const result = await this.database.query<{
      id: string; title: string | null; section: string | null; content: string;
      score: string | number; source_type: string; document_id: string | null;
      knowledge_item_version_id: string | null;
    }>(
      `SELECT chunk.id, chunk.title, chunk.section, chunk.content,
        1 - (chunk.embedding <=> $2::vector) AS score,
        chunk.metadata->>'sourceType' AS source_type, chunk.document_id,
        chunk.knowledge_item_version_id
       FROM knowledge_chunks chunk
       LEFT JOIN knowledge_documents document
         ON document.tenant_id = chunk.tenant_id AND document.id = chunk.document_id
       LEFT JOIN knowledge_item_versions version
         ON version.tenant_id = chunk.tenant_id AND version.id = chunk.knowledge_item_version_id
       WHERE chunk.tenant_id = $1 AND chunk.status = 'active'
         AND chunk.embedding_model = $3
         AND (document.id IS NULL OR document.processing_status = 'ready')
         AND (version.id IS NULL OR (version.status = 'published'
           AND (version.valid_from IS NULL OR version.valid_from <= NOW())
           AND (version.valid_until IS NULL OR version.valid_until > NOW())))
       ORDER BY chunk.embedding <=> $2::vector
       LIMIT $4;`,
      [tenantId, vectorLiteral(embedding), integration.model, limit]
    );
    return result.rows.map((row) => ({
      chunkId: row.id, title: row.title, section: row.section, content: row.content,
      score: Number(row.score), sourceType: row.source_type,
      documentId: row.document_id, knowledgeVersionId: row.knowledge_item_version_id
    }));
  }
}
