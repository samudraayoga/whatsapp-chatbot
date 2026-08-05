import { AppError } from '../middleware/error.middleware.js';
import type {
  CategoryWriteInput,
  KnowledgeSourceType,
  KnowledgeStatus,
  KnowledgeWriteInput
} from './knowledge.service.js';

const invalid = (message: string, field?: string): never => {
  throw new AppError(message, 400, 'KNOWLEDGE_REQUEST_INVALID', field ? { field } : undefined);
};

const recordValue = (value: unknown, field = 'body'): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalid(`${field} must be an object`, field);
  }
  return value as Record<string, unknown>;
};

const text = (
  record: Record<string, unknown>,
  field: string,
  min: number,
  max: number
): string => {
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) {
    return invalid(`${field} must be between ${min} and ${max} characters`, field);
  }
  return value.trim();
};

const optionalText = (
  record: Record<string, unknown>,
  field: string,
  max: number
): string | null => {
  const value = record[field];
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > max) {
    return invalid(`${field} must be null or at most ${max} characters`, field);
  }
  return value.trim() || null;
};

const integer = (record: Record<string, unknown>, field: string, min: number, max: number): number => {
  const value = record[field];
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    return invalid(`${field} must be an integer between ${min} and ${max}`, field);
  }
  return value as number;
};

const boolean = (record: Record<string, unknown>, field: string): boolean => {
  if (typeof record[field] !== 'boolean') return invalid(`${field} must be a boolean`, field);
  return record[field] as boolean;
};

const nullableUuid = (record: Record<string, unknown>, field: string): string | null => {
  const value = record[field];
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return invalid(`${field} must be null or a UUID`, field);
  }
  return value;
};

const safeContent = (value: string, field: string): string => {
  if (/<\/?[a-z][^>]*>|javascript\s*:/i.test(value)) {
    return invalid(`${field} must not contain raw HTML or javascript URLs`, field);
  }
  return value;
};

const dateValue = (record: Record<string, unknown>, field: string): string | null => {
  const value = record[field];
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return invalid(`${field} must be null or an ISO date-time`, field);
  }
  return new Date(value).toISOString();
};

export const parseCategoryWrite = (value: unknown): CategoryWriteInput & { expectedRevision?: number } => {
  const record = recordValue(value);
  const slug = text(record, 'slug', 2, 150);
  const description = optionalText(record, 'description', 2000);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return invalid('slug must use lowercase letters, numbers, and hyphens', 'slug');
  }
  return {
    name: safeContent(text(record, 'name', 2, 150), 'name'),
    slug,
    description: description === null ? null : safeContent(description, 'description'),
    active: boolean(record, 'active'),
    sortOrder: integer(record, 'sortOrder', 0, 10_000),
    ...(record.expectedRevision === undefined
      ? {}
      : { expectedRevision: integer(record, 'expectedRevision', 1, 2_147_483_647) })
  };
};

export const parseKnowledgeWrite = (value: unknown): KnowledgeWriteInput => {
  const record = recordValue(value, 'knowledge');
  const sourceType = record.sourceType;
  if (sourceType !== 'faq' && sourceType !== 'article') {
    return invalid('sourceType must be faq or article', 'sourceType');
  }
  const question = optionalText(record, 'question', 2000);
  if (sourceType === 'faq' && !question) {
    return invalid('question is required for FAQ knowledge', 'question');
  }
  const variantsValue = record.questionVariants;
  if (!Array.isArray(variantsValue) || variantsValue.length > 50) {
    return invalid('questionVariants must be an array with at most 50 entries', 'questionVariants');
  }
  const variants = variantsValue.map((entry, index) => {
    if (typeof entry !== 'string' || entry.trim().length < 1 || entry.length > 2000) {
      return invalid(`questionVariants[${index}] is invalid`, 'questionVariants');
    }
    return safeContent(entry.trim(), 'questionVariants');
  });
  if (new Set(variants.map((entry) => entry.toLocaleLowerCase('id-ID'))).size !== variants.length) {
    return invalid('questionVariants must not contain duplicates', 'questionVariants');
  }
  const tagsValue = record.tags ?? [];
  if (!Array.isArray(tagsValue) || tagsValue.length > 20) {
    return invalid('tags must be an array with at most 20 entries', 'tags');
  }
  const tags = tagsValue.map((entry, index) => {
    if (typeof entry !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,49}$/i.test(entry)) {
      return invalid(`tags[${index}] is invalid`, 'tags');
    }
    return entry.toLocaleLowerCase('id-ID');
  });
  if (new Set(tags).size !== tags.length) return invalid('tags must be unique', 'tags');
  const metadata = record.metadata ?? {};
  const serializedMetadata = JSON.stringify(metadata);
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || serializedMetadata.length > 10_000) {
    return invalid('metadata must be an object no larger than 10000 characters', 'metadata');
  }
  safeContent(serializedMetadata, 'metadata');
  const sourceReference = optionalText(record, 'sourceReference', 2000);
  const internalNotes = optionalText(record, 'internalNotes', 5000);
  const validFrom = dateValue(record, 'validFrom');
  const validUntil = dateValue(record, 'validUntil');
  if (validFrom && validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) {
    return invalid('validUntil must be later than validFrom', 'validUntil');
  }
  return {
    categoryId: nullableUuid(record, 'categoryId'),
    sourceType: sourceType as KnowledgeSourceType,
    title: safeContent(text(record, 'title', 3, 255), 'title'),
    question: question ? safeContent(question, 'question') : null,
    questionVariants: variants,
    content: safeContent(text(record, 'content', 1, 100_000), 'content'),
    sourceReference: sourceReference === null
      ? null
      : safeContent(sourceReference, 'sourceReference'),
    internalNotes: internalNotes === null
      ? null
      : safeContent(internalNotes, 'internalNotes'),
    tags,
    metadata: metadata as Record<string, unknown>,
    requiresDisclaimer: boolean(record, 'requiresDisclaimer'),
    priority: integer(record, 'priority', 0, 100),
    validFrom,
    validUntil
  };
};

export const parseKnowledgeUpdate = (value: unknown): {
  expectedVersion: number;
  expectedRevision: number;
  knowledge: KnowledgeWriteInput;
} => {
  const record = recordValue(value);
  return {
    expectedVersion: integer(record, 'expectedVersion', 1, 2_147_483_647),
    expectedRevision: integer(record, 'expectedRevision', 1, 2_147_483_647),
    knowledge: parseKnowledgeWrite(record.knowledge)
  };
};

export const parseKnowledgeLifecycle = (value: unknown): {
  expectedVersion: number;
  expectedRevision: number;
  reason: string;
} => {
  const record = recordValue(value);
  return {
    expectedVersion: integer(record, 'expectedVersion', 1, 2_147_483_647),
    expectedRevision: integer(record, 'expectedRevision', 1, 2_147_483_647),
    reason: safeContent(text(record, 'reason', 5, 500), 'reason')
  };
};

export const parseBulkKnowledgeAction = (value: unknown): {
  itemIds: string[];
  action: 'publish' | 'archive';
  reason: string;
} => {
  const record = recordValue(value);
  if (!Array.isArray(record.itemIds) || record.itemIds.length < 1 || record.itemIds.length > 50) {
    return invalid('itemIds must contain between 1 and 50 UUIDs', 'itemIds');
  }
  const itemIds = record.itemIds.map((id) => {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return invalid('itemIds contains an invalid UUID', 'itemIds');
    return id;
  });
  if (new Set(itemIds).size !== itemIds.length) return invalid('itemIds must be unique', 'itemIds');
  if (record.action !== 'publish' && record.action !== 'archive') {
    return invalid('action must be publish or archive', 'action');
  }
  return {
    itemIds,
    action: record.action,
    reason: safeContent(text(record, 'reason', 5, 500), 'reason')
  };
};

export const parseKnowledgeStatus = (value: unknown): KnowledgeStatus | undefined => {
  if (value === undefined) return undefined;
  if (value === 'draft' || value === 'review' || value === 'approved' || value === 'published' || value === 'archived') return value;
  return invalid('status filter is invalid', 'status');
};

export const parseKnowledgeSourceType = (value: unknown): KnowledgeSourceType | undefined => {
  if (value === undefined) return undefined;
  if (value === 'faq' || value === 'article') return value;
  return invalid('sourceType filter is invalid', 'sourceType');
};
