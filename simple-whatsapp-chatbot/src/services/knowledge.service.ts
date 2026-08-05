import { createHash, randomUUID } from 'node:crypto';
import { pool } from '../database/connection.js';
import { AppError } from '../middleware/error.middleware.js';
import type { QueryExecutor } from './message.service.js';

type TransactionClient = QueryExecutor & { release(): void };
type TransactionalExecutor = QueryExecutor & {
  connect(): Promise<TransactionClient>;
};

const hasTransactions = (
  database: QueryExecutor
): database is TransactionalExecutor =>
  typeof (database as Partial<TransactionalExecutor>).connect === 'function';

export type KnowledgeStatus =
  | 'draft'
  | 'review'
  | 'approved'
  | 'published'
  | 'archived';
export type KnowledgeSourceType = 'faq' | 'article';

export type KnowledgeCategory = {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  revision: number;
  knowledgeCount: number;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeItem = {
  id: string;
  tenantId: string;
  categoryId: string | null;
  categoryName: string | null;
  sourceType: KnowledgeSourceType;
  versionId: string;
  version: number;
  revision: number;
  status: KnowledgeStatus;
  title: string;
  question: string | null;
  questionVariants: string[];
  content: string;
  sourceReference: string | null;
  internalNotes: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  contentFingerprint: string;
  requiresDisclaimer: boolean;
  priority: number;
  validFrom: string | null;
  validUntil: string | null;
  expired: boolean;
  createdBy: string;
  approvedBy: string | null;
  publishedBy: string | null;
  changeReason: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  publishedAt: string | null;
};

export type KnowledgeWriteInput = {
  categoryId: string | null;
  sourceType: KnowledgeSourceType;
  title: string;
  question: string | null;
  questionVariants: string[];
  content: string;
  sourceReference: string | null;
  internalNotes: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  requiresDisclaimer: boolean;
  priority: number;
  validFrom: string | null;
  validUntil: string | null;
};

export type CategoryWriteInput = {
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
};

type CategoryRow = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  revision: number;
  knowledge_count: string | number;
  created_at: Date | string;
  updated_at: Date | string;
};

type KnowledgeRow = {
  id: string;
  tenant_id: string;
  category_id: string | null;
  category_name: string | null;
  source_type: KnowledgeSourceType;
  version_id: string;
  version: number;
  revision: number;
  status: KnowledgeStatus;
  title: string;
  question: string | null;
  question_variants: unknown;
  content: string;
  source_reference: string | null;
  internal_notes: string | null;
  tags: unknown;
  metadata: unknown;
  content_fingerprint: string;
  requires_disclaimer: boolean;
  priority: number;
  valid_from: Date | string | null;
  valid_until: Date | string | null;
  expired: boolean;
  created_by: string;
  approved_by: string | null;
  published_by: string | null;
  change_reason: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  approved_at: Date | string | null;
  published_at: Date | string | null;
};

type CurrentVersionRow = {
  item_id: string;
  category_id: string | null;
  source_type: KnowledgeSourceType;
  current_version: number;
  published_version_id: string | null;
  version_id: string;
  revision: number;
  status: KnowledgeStatus;
};

const iso = (value: Date | string): string => new Date(value).toISOString();
const nullableIso = (value: Date | string | null): string | null =>
  value ? iso(value) : null;
const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const recordValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const toCategory = (row: CategoryRow): KnowledgeCategory => ({
  id: row.id,
  tenantId: row.tenant_id,
  name: row.name,
  slug: row.slug,
  description: row.description,
  active: row.is_active,
  sortOrder: row.sort_order,
  revision: row.revision,
  knowledgeCount: Number(row.knowledge_count),
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at)
});

const toKnowledge = (row: KnowledgeRow): KnowledgeItem => ({
  id: row.id,
  tenantId: row.tenant_id,
  categoryId: row.category_id,
  categoryName: row.category_name,
  sourceType: row.source_type,
  versionId: row.version_id,
  version: row.version,
  revision: row.revision,
  status: row.status,
  title: row.title,
  question: row.question,
  questionVariants: stringArray(row.question_variants),
  content: row.content,
  sourceReference: row.source_reference,
  internalNotes: row.internal_notes,
  tags: stringArray(row.tags),
  metadata: recordValue(row.metadata),
  contentFingerprint: row.content_fingerprint,
  requiresDisclaimer: row.requires_disclaimer,
  priority: row.priority,
  validFrom: nullableIso(row.valid_from),
  validUntil: nullableIso(row.valid_until),
  expired: row.expired,
  createdBy: row.created_by,
  approvedBy: row.approved_by,
  publishedBy: row.published_by,
  changeReason: row.change_reason,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
  approvedAt: nullableIso(row.approved_at),
  publishedAt: nullableIso(row.published_at)
});

export const normalizeKnowledgeQuestion = (value: string): string =>
  value.normalize('NFKC').trim().toLocaleLowerCase('id-ID').replace(/\s+/g, ' ');

export const knowledgeFingerprint = (input: KnowledgeWriteInput): string =>
  createHash('sha256')
    .update(JSON.stringify({
      categoryId: input.categoryId,
      sourceType: input.sourceType,
      title: input.title,
      question: input.question,
      questionVariants: input.questionVariants.map(normalizeKnowledgeQuestion).sort(),
      content: input.content,
      sourceReference: input.sourceReference,
      tags: [...input.tags].sort(),
      metadata: input.metadata,
      requiresDisclaimer: input.requiresDisclaimer,
      priority: input.priority,
      validFrom: input.validFrom,
      validUntil: input.validUntil
    }))
    .digest('hex');

const categorySelect = `
  SELECT category.*,
    (SELECT COUNT(*) FROM knowledge_items item
      WHERE item.tenant_id = category.tenant_id
        AND item.category_id = category.id) AS knowledge_count
  FROM knowledge_categories category
`;

const knowledgeSelect = `
  SELECT
    item.id,
    item.tenant_id,
    item.category_id,
    category.name AS category_name,
    item.source_type,
    version.id AS version_id,
    version.version,
    version.revision,
    version.status,
    version.title,
    version.question,
    variants.question_variants,
    version.content,
    version.source_reference,
    version.internal_notes,
    version.tags,
    version.metadata,
    version.content_fingerprint,
    version.requires_disclaimer,
    version.priority,
    version.valid_from,
    version.valid_until,
    (version.valid_until IS NOT NULL AND version.valid_until <= NOW()) AS expired,
    version.created_by,
    version.approved_by,
    version.published_by,
    version.change_reason,
    version.created_at,
    version.updated_at,
    version.approved_at,
    version.published_at
  FROM knowledge_items item
  INNER JOIN knowledge_item_versions version
    ON version.tenant_id = item.tenant_id
   AND version.knowledge_item_id = item.id
   AND version.version = item.current_version
  LEFT JOIN knowledge_categories category
    ON category.tenant_id = item.tenant_id
   AND category.id = item.category_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(variant.question ORDER BY variant.created_at, variant.id), '[]'::jsonb)
      AS question_variants
    FROM knowledge_question_variants variant
    WHERE variant.tenant_id = version.tenant_id
      AND variant.knowledge_item_version_id = version.id
  ) variants ON TRUE
`;

const isUniqueViolation = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505');

export class KnowledgeService {
  constructor(private readonly database: QueryExecutor = pool) {}

  private async transaction<T>(callback: (database: QueryExecutor) => Promise<T>): Promise<T> {
    if (!hasTransactions(this.database)) return callback(this.database);
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const value = await callback(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async ensureInitialCategories(tenantId: string): Promise<void> {
    const names = [
      'Tentang RAHO', 'Layanan dan Terapi', 'Harga dan Membership',
      'Lokasi Cabang', 'Kredibilitas dan Keamanan', 'Nano Bubble dan Edukasi',
      'Kesehatan dan Kelayakan', 'Produk dan Paket', 'Karier',
      'Informasi Umum', 'Kebijakan', 'Lainnya'
    ];
    for (const [index, name] of names.entries()) {
      const slug = name
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('id-ID')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      await this.database.query(
        `INSERT INTO knowledge_categories
          (id, tenant_id, name, slug, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, slug) DO NOTHING;`,
        [randomUUID(), tenantId, name, slug, index + 1]
      );
    }
  }

  async listCategories(tenantId: string): Promise<KnowledgeCategory[]> {
    const result = await this.database.query<CategoryRow>(
      `${categorySelect}
       WHERE category.tenant_id = $1
       ORDER BY category.sort_order, category.name, category.id;`,
      [tenantId]
    );
    return result.rows.map(toCategory);
  }

  async createCategory(tenantId: string, input: CategoryWriteInput): Promise<KnowledgeCategory> {
    try {
      const result = await this.database.query<CategoryRow>(
        `INSERT INTO knowledge_categories
          (id, tenant_id, name, slug, description, is_active, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *, 0::int AS knowledge_count;`,
        [randomUUID(), tenantId, input.name, input.slug, input.description, input.active, input.sortOrder]
      );
      return toCategory(result.rows[0]!);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError('Category slug already exists for this tenant', 409, 'KNOWLEDGE_CATEGORY_SLUG_CONFLICT');
      }
      throw error;
    }
  }

  async updateCategory(
    tenantId: string,
    categoryId: string,
    expectedRevision: number,
    input: CategoryWriteInput
  ): Promise<{ before: KnowledgeCategory; after: KnowledgeCategory }> {
    const beforeResult = await this.database.query<CategoryRow>(
      `${categorySelect} WHERE category.tenant_id = $1 AND category.id = $2;`,
      [tenantId, categoryId]
    );
    if (!beforeResult.rows[0]) throw new AppError('Knowledge category was not found', 404, 'KNOWLEDGE_CATEGORY_NOT_FOUND');
    try {
      const result = await this.database.query<CategoryRow>(
        `UPDATE knowledge_categories category SET
          name = $4, slug = $5, description = $6, is_active = $7,
          sort_order = $8, revision = revision + 1, updated_at = NOW()
         WHERE category.tenant_id = $1 AND category.id = $2 AND category.revision = $3
         RETURNING category.*,
           (SELECT COUNT(*) FROM knowledge_items item
             WHERE item.tenant_id = category.tenant_id AND item.category_id = category.id) AS knowledge_count;`,
        [tenantId, categoryId, expectedRevision, input.name, input.slug, input.description, input.active, input.sortOrder]
      );
      if (!result.rows[0]) throw new AppError('Knowledge category revision is stale', 409, 'KNOWLEDGE_CATEGORY_REVISION_CONFLICT');
      return { before: toCategory(beforeResult.rows[0]), after: toCategory(result.rows[0]) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError('Category slug already exists for this tenant', 409, 'KNOWLEDGE_CATEGORY_SLUG_CONFLICT');
      }
      throw error;
    }
  }

  async deleteCategory(tenantId: string, categoryId: string): Promise<KnowledgeCategory> {
    return this.transaction(async (database) => {
      const result = await database.query<CategoryRow>(
        `${categorySelect} WHERE category.tenant_id = $1 AND category.id = $2 FOR UPDATE;`,
        [tenantId, categoryId]
      );
      const category = result.rows[0];
      if (!category) throw new AppError('Knowledge category was not found', 404, 'KNOWLEDGE_CATEGORY_NOT_FOUND');
      if (Number(category.knowledge_count) > 0) {
        throw new AppError('Category is still referenced by knowledge items', 409, 'KNOWLEDGE_CATEGORY_IN_USE');
      }
      await database.query('DELETE FROM knowledge_categories WHERE tenant_id = $1 AND id = $2;', [tenantId, categoryId]);
      return toCategory(category);
    });
  }

  private async assertCategory(database: QueryExecutor, tenantId: string, categoryId: string | null): Promise<void> {
    if (!categoryId) return;
    const result = await database.query(
      'SELECT 1 FROM knowledge_categories WHERE tenant_id = $1 AND id = $2 LIMIT 1;',
      [tenantId, categoryId]
    );
    if (!result.rows[0]) throw new AppError('Knowledge category was not found for this tenant', 400, 'KNOWLEDGE_CATEGORY_INVALID');
  }

  private async replaceVariants(
    database: QueryExecutor,
    tenantId: string,
    versionId: string,
    variants: string[]
  ): Promise<void> {
    await database.query(
      'DELETE FROM knowledge_question_variants WHERE tenant_id = $1 AND knowledge_item_version_id = $2;',
      [tenantId, versionId]
    );
    for (const question of variants) {
      await database.query(
        `INSERT INTO knowledge_question_variants
          (id, tenant_id, knowledge_item_version_id, question, normalized_question)
         VALUES ($1, $2, $3, $4, $5);`,
        [randomUUID(), tenantId, versionId, question, normalizeKnowledgeQuestion(question)]
      );
    }
  }

  private versionValues(input: KnowledgeWriteInput): unknown[] {
    return [
      input.title, input.question, input.content, input.sourceReference,
      input.internalNotes, JSON.stringify(input.tags), JSON.stringify(input.metadata),
      knowledgeFingerprint(input), input.requiresDisclaimer, input.priority,
      input.validFrom, input.validUntil
    ];
  }

  async createKnowledge(tenantId: string, actorId: string, input: KnowledgeWriteInput): Promise<KnowledgeItem> {
    const itemId = randomUUID();
    const versionId = randomUUID();
    await this.transaction(async (database) => {
      await this.assertCategory(database, tenantId, input.categoryId);
      await database.query(
        `INSERT INTO knowledge_items
          (id, tenant_id, category_id, source_type, current_version, created_by)
         VALUES ($1, $2, $3, $4, 1, $5);`,
        [itemId, tenantId, input.categoryId, input.sourceType, actorId]
      );
      const values = this.versionValues(input);
      await database.query(
        `INSERT INTO knowledge_item_versions (
          id, tenant_id, knowledge_item_id, version, revision,
          title, question, content, source_reference, internal_notes, tags,
          metadata, content_fingerprint, requires_disclaimer, priority,
          valid_from, valid_until, created_by
        ) VALUES ($1, $2, $3, 1, 1, $4, $5, $6, $7, $8, $9::jsonb,
          $10::jsonb, $11, $12, $13, $14, $15, $16);`,
        [versionId, tenantId, itemId, ...values, actorId]
      );
      await this.replaceVariants(database, tenantId, versionId, input.questionVariants);
    });
    return this.getKnowledge(tenantId, itemId);
  }

  private async currentVersion(
    database: QueryExecutor,
    tenantId: string,
    itemId: string,
    lock = false
  ): Promise<CurrentVersionRow> {
    const result = await database.query<CurrentVersionRow>(
      `SELECT item.id AS item_id, item.category_id, item.source_type,
        item.current_version, item.published_version_id,
        version.id AS version_id, version.revision, version.status
       FROM knowledge_items item
       INNER JOIN knowledge_item_versions version
         ON version.tenant_id = item.tenant_id
        AND version.knowledge_item_id = item.id
        AND version.version = item.current_version
       WHERE item.tenant_id = $1 AND item.id = $2${lock ? ' FOR UPDATE OF item, version' : ''};`,
      [tenantId, itemId]
    );
    if (!result.rows[0]) throw new AppError('Knowledge item was not found', 404, 'KNOWLEDGE_NOT_FOUND');
    return result.rows[0];
  }

  async getKnowledge(tenantId: string, itemId: string): Promise<KnowledgeItem> {
    const result = await this.database.query<KnowledgeRow>(
      `${knowledgeSelect} WHERE item.tenant_id = $1 AND item.id = $2;`,
      [tenantId, itemId]
    );
    if (!result.rows[0]) throw new AppError('Knowledge item was not found', 404, 'KNOWLEDGE_NOT_FOUND');
    return toKnowledge(result.rows[0]);
  }

  async listKnowledge(
    tenantId: string,
    filter: {
      limit: number;
      offset: number;
      query?: string;
      status?: KnowledgeStatus;
      sourceType?: KnowledgeSourceType;
      categoryId?: string;
      expired?: boolean;
      requiresDisclaimer?: boolean;
    }
  ): Promise<{ data: KnowledgeItem[]; nextCursor: string | null }> {
    const values: unknown[] = [tenantId];
    const where = ['item.tenant_id = $1'];
    const add = (clause: string, value: unknown) => {
      values.push(value);
      where.push(clause.split('?').join(`$${values.length}`));
    };
    if (filter.query) add(`(version.title ILIKE '%' || ? || '%' OR version.question ILIKE '%' || ? || '%' OR version.content ILIKE '%' || ? || '%' OR EXISTS (SELECT 1 FROM knowledge_question_variants search_variant WHERE search_variant.tenant_id = item.tenant_id AND search_variant.knowledge_item_version_id = version.id AND search_variant.question ILIKE '%' || ? || '%'))`, filter.query);
    if (filter.status) add('version.status = ?', filter.status);
    if (filter.sourceType) add('item.source_type = ?', filter.sourceType);
    if (filter.categoryId) add('item.category_id = ?', filter.categoryId);
    if (filter.expired !== undefined) where.push(filter.expired ? '(version.valid_until IS NOT NULL AND version.valid_until <= NOW())' : '(version.valid_until IS NULL OR version.valid_until > NOW())');
    if (filter.requiresDisclaimer !== undefined) add('version.requires_disclaimer = ?', filter.requiresDisclaimer);
    values.push(filter.limit + 1, filter.offset);
    const result = await this.database.query<KnowledgeRow>(
      `${knowledgeSelect}
       WHERE ${where.join(' AND ')}
       ORDER BY version.updated_at DESC, item.id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length};`,
      values
    );
    const hasMore = result.rows.length > filter.limit;
    return {
      data: result.rows.slice(0, filter.limit).map(toKnowledge),
      nextCursor: hasMore ? String(filter.offset + filter.limit) : null
    };
  }

  async listPublishedCandidates(tenantId: string): Promise<KnowledgeItem[]> {
    const result = await this.database.query<KnowledgeRow>(
      `${knowledgeSelect.replace(
        'version.version = item.current_version',
        'version.id = item.published_version_id'
      )}
       WHERE item.tenant_id = $1
         AND version.status = 'published'
         AND (version.valid_from IS NULL OR version.valid_from <= NOW())
         AND (version.valid_until IS NULL OR version.valid_until > NOW())
         AND (category.id IS NULL OR category.is_active = TRUE)
       ORDER BY version.priority DESC, version.updated_at DESC;`,
      [tenantId]
    );
    return result.rows.map(toKnowledge);
  }

  async updateKnowledge(
    tenantId: string,
    itemId: string,
    actorId: string,
    expectedVersion: number,
    expectedRevision: number,
    input: KnowledgeWriteInput
  ): Promise<{ before: KnowledgeItem; after: KnowledgeItem; createdVersion: boolean }> {
    const before = await this.getKnowledge(tenantId, itemId);
    let createdVersion = false;
    await this.transaction(async (database) => {
      const current = await this.currentVersion(database, tenantId, itemId, true);
      if (current.current_version !== expectedVersion || current.revision !== expectedRevision) {
        throw new AppError('Knowledge version or revision is stale', 409, 'KNOWLEDGE_REVISION_CONFLICT');
      }
      await this.assertCategory(database, tenantId, input.categoryId);
      const values = this.versionValues(input);
      if (current.status === 'published' || current.status === 'archived') {
        createdVersion = true;
        const nextVersion = current.current_version + 1;
        const versionId = randomUUID();
        await database.query(
          `INSERT INTO knowledge_item_versions (
            id, tenant_id, knowledge_item_id, version, revision,
            title, question, content, source_reference, internal_notes, tags,
            metadata, content_fingerprint, requires_disclaimer, priority,
            valid_from, valid_until, created_by
          ) VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, $9, $10::jsonb,
            $11::jsonb, $12, $13, $14, $15, $16, $17);`,
          [versionId, tenantId, itemId, nextVersion, ...values, actorId]
        );
        await this.replaceVariants(database, tenantId, versionId, input.questionVariants);
        await database.query(
          `UPDATE knowledge_items SET category_id = $3, source_type = $4,
            current_version = $5, updated_at = NOW()
           WHERE tenant_id = $1 AND id = $2;`,
          [tenantId, itemId, input.categoryId, input.sourceType, nextVersion]
        );
        return;
      }
      if (current.status !== 'draft') {
        throw new AppError('Only draft knowledge can be edited; request revision first', 409, 'KNOWLEDGE_STATE_CONFLICT');
      }
      const result = await database.query(
        `UPDATE knowledge_item_versions SET
          title = $4, question = $5, content = $6, source_reference = $7,
          internal_notes = $8, tags = $9::jsonb, metadata = $10::jsonb,
          content_fingerprint = $11, requires_disclaimer = $12, priority = $13,
          valid_from = $14, valid_until = $15, revision = revision + 1,
          updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2 AND revision = $3;`,
        [tenantId, current.version_id, expectedRevision, ...values]
      );
      if (result.rowCount !== 1) throw new AppError('Knowledge revision is stale', 409, 'KNOWLEDGE_REVISION_CONFLICT');
      await this.replaceVariants(database, tenantId, current.version_id, input.questionVariants);
      await database.query(
        `UPDATE knowledge_items SET category_id = $3, source_type = $4, updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2;`,
        [tenantId, itemId, input.categoryId, input.sourceType]
      );
    });
    return { before, after: await this.getKnowledge(tenantId, itemId), createdVersion };
  }

  private async transition(
    database: QueryExecutor,
    tenantId: string,
    itemId: string,
    actorId: string,
    expectedVersion: number,
    expectedRevision: number,
    action: 'submit_review' | 'request_revision' | 'approve' | 'publish' | 'archive',
    reason: string
  ): Promise<void> {
    const current = await this.currentVersion(database, tenantId, itemId, true);
    if (current.current_version !== expectedVersion || current.revision !== expectedRevision) {
      throw new AppError('Knowledge version or revision is stale', 409, 'KNOWLEDGE_REVISION_CONFLICT');
    }
    const expectedState: Record<typeof action, KnowledgeStatus> = {
      submit_review: 'draft', request_revision: 'review', approve: 'review',
      publish: 'approved', archive: 'published'
    };
    const nextState: Record<typeof action, KnowledgeStatus> = {
      submit_review: 'review', request_revision: 'draft', approve: 'approved',
      publish: 'published', archive: 'archived'
    };
    if (current.status !== expectedState[action]) {
      throw new AppError(`Knowledge must be ${expectedState[action]} before ${action}`, 409, 'KNOWLEDGE_STATE_CONFLICT');
    }
    if (action === 'publish') {
      await database.query(
        `UPDATE knowledge_item_versions SET status = 'archived', revision = revision + 1,
          updated_at = NOW(), change_reason = $3
         WHERE tenant_id = $1 AND knowledge_item_id = $2 AND status = 'published';`,
        [tenantId, itemId, 'Superseded by version ' + expectedVersion]
      );
    }
    await database.query(
      `UPDATE knowledge_item_versions SET
        status = $4, revision = revision + 1, change_reason = $5,
        approved_by = CASE WHEN $6 THEN $3 ELSE approved_by END,
        approved_at = CASE WHEN $6 THEN NOW() ELSE approved_at END,
        published_by = CASE WHEN $7 THEN $3 ELSE published_by END,
        published_at = CASE WHEN $7 THEN NOW() ELSE published_at END,
        updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2;`,
      [tenantId, current.version_id, actorId, nextState[action], reason, action === 'approve', action === 'publish']
    );
    await database.query(
      `UPDATE knowledge_items SET published_version_id = $3, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2;`,
      [tenantId, itemId, action === 'publish' ? current.version_id : action === 'archive' ? null : current.published_version_id]
    );
  }

  async transitionKnowledge(
    tenantId: string,
    itemId: string,
    actorId: string,
    expectedVersion: number,
    expectedRevision: number,
    action: 'submit_review' | 'request_revision' | 'approve' | 'publish' | 'archive',
    reason: string
  ): Promise<{ before: KnowledgeItem; after: KnowledgeItem }> {
    const before = await this.getKnowledge(tenantId, itemId);
    await this.transaction((database) => this.transition(database, tenantId, itemId, actorId, expectedVersion, expectedRevision, action, reason));
    return { before, after: await this.getKnowledge(tenantId, itemId) };
  }

  async bulkAction(
    tenantId: string,
    itemIds: string[],
    actorId: string,
    action: 'publish' | 'archive',
    reason: string
  ): Promise<KnowledgeItem[]> {
    await this.transaction(async (database) => {
      for (const itemId of itemIds) {
        const current = await this.currentVersion(database, tenantId, itemId, true);
        await this.transition(database, tenantId, itemId, actorId, current.current_version, current.revision, action, reason);
      }
    });
    return Promise.all(itemIds.map((itemId) => this.getKnowledge(tenantId, itemId)));
  }

  async deleteDraft(tenantId: string, itemId: string): Promise<KnowledgeItem> {
    const before = await this.getKnowledge(tenantId, itemId);
    await this.transaction(async (database) => {
      const current = await this.currentVersion(database, tenantId, itemId, true);
      if (current.status !== 'draft') throw new AppError('Only the current draft can be deleted', 409, 'KNOWLEDGE_STATE_CONFLICT');
      const previous = await database.query<{ version: number }>(
        `SELECT version FROM knowledge_item_versions
         WHERE tenant_id = $1 AND knowledge_item_id = $2 AND version < $3
         ORDER BY version DESC LIMIT 1;`,
        [tenantId, itemId, current.current_version]
      );
      if (!previous.rows[0]) {
        await database.query('DELETE FROM knowledge_items WHERE tenant_id = $1 AND id = $2;', [tenantId, itemId]);
        return;
      }
      await database.query('DELETE FROM knowledge_item_versions WHERE tenant_id = $1 AND id = $2;', [tenantId, current.version_id]);
      await database.query(
        'UPDATE knowledge_items SET current_version = $3, updated_at = NOW() WHERE tenant_id = $1 AND id = $2;',
        [tenantId, itemId, previous.rows[0].version]
      );
    });
    return before;
  }
}
