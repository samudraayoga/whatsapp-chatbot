import { readCookie } from './auth';
import { requestJson } from './client';
import {
  knowledgeBulkResponseSchema,
  knowledgeCategoryListResponseSchema,
  knowledgeCategoryResponseSchema,
  knowledgeListResponseSchema,
  knowledgeResponseSchema,
  type KnowledgeCategoryListResponse,
  type KnowledgeCategoryResponse,
  type KnowledgeItem,
  type KnowledgeListResponse,
  type KnowledgeResponse
} from './contracts';

const csrfHeaders = (): HeadersInit => {
  const token = readCookie('admin_csrf');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'X-CSRF-Token': token } : {})
  };
};

export type CategoryWriteInput = {
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
};

export type KnowledgeWriteInput = {
  categoryId: string | null;
  sourceType: 'faq' | 'article';
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

export type KnowledgeFilters = {
  query?: string;
  status?: KnowledgeItem['status'];
  sourceType?: KnowledgeItem['sourceType'];
  categoryId?: string;
  expired?: boolean;
  requiresDisclaimer?: boolean;
  cursor?: string;
};

export const listKnowledgeCategories = async (): Promise<KnowledgeCategoryListResponse> =>
  knowledgeCategoryListResponseSchema.parse(
    await requestJson('/api/admin/v1/ai-chatbot/categories')
  );

export const createKnowledgeCategory = async (
  input: CategoryWriteInput
): Promise<KnowledgeCategoryResponse> =>
  knowledgeCategoryResponseSchema.parse(
    await requestJson('/api/admin/v1/ai-chatbot/categories', {
      method: 'POST', headers: csrfHeaders(), body: JSON.stringify(input)
    })
  );

export const updateKnowledgeCategory = async (
  categoryId: string,
  expectedRevision: number,
  input: CategoryWriteInput
): Promise<KnowledgeCategoryResponse> =>
  knowledgeCategoryResponseSchema.parse(
    await requestJson(`/api/admin/v1/ai-chatbot/categories/${encodeURIComponent(categoryId)}`, {
      method: 'PUT', headers: csrfHeaders(),
      body: JSON.stringify({ ...input, expectedRevision })
    })
  );

export const deleteKnowledgeCategory = async (categoryId: string): Promise<void> => {
  await requestJson(`/api/admin/v1/ai-chatbot/categories/${encodeURIComponent(categoryId)}`, {
    method: 'DELETE', headers: csrfHeaders()
  });
};

export const listKnowledge = async (filters: KnowledgeFilters = {}): Promise<KnowledgeListResponse> => {
  const params = new URLSearchParams({ limit: '50' });
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return knowledgeListResponseSchema.parse(
    await requestJson(`/api/admin/v1/ai-chatbot/knowledge?${params}`)
  );
};

export const getKnowledge = async (knowledgeId: string): Promise<KnowledgeResponse> =>
  knowledgeResponseSchema.parse(
    await requestJson(`/api/admin/v1/ai-chatbot/knowledge/${encodeURIComponent(knowledgeId)}`)
  );

export const createKnowledge = async (input: KnowledgeWriteInput): Promise<KnowledgeResponse> =>
  knowledgeResponseSchema.parse(
    await requestJson('/api/admin/v1/ai-chatbot/knowledge', {
      method: 'POST', headers: csrfHeaders(), body: JSON.stringify(input)
    })
  );

export const updateKnowledge = async (
  item: Pick<KnowledgeItem, 'id' | 'version' | 'revision'>,
  knowledge: KnowledgeWriteInput
): Promise<KnowledgeResponse> =>
  knowledgeResponseSchema.parse(
    await requestJson(`/api/admin/v1/ai-chatbot/knowledge/${encodeURIComponent(item.id)}`, {
      method: 'PUT', headers: csrfHeaders(),
      body: JSON.stringify({ expectedVersion: item.version, expectedRevision: item.revision, knowledge })
    })
  );

export const deleteKnowledgeDraft = async (knowledgeId: string): Promise<void> => {
  await requestJson(`/api/admin/v1/ai-chatbot/knowledge/${encodeURIComponent(knowledgeId)}`, {
    method: 'DELETE', headers: csrfHeaders()
  });
};

export const transitionKnowledge = async (
  item: Pick<KnowledgeItem, 'id' | 'version' | 'revision'>,
  transition: 'submit-review' | 'request-revision' | 'approve' | 'publish' | 'archive',
  reason: string
): Promise<KnowledgeResponse> =>
  knowledgeResponseSchema.parse(
    await requestJson(`/api/admin/v1/ai-chatbot/knowledge/${encodeURIComponent(item.id)}/${transition}`, {
      method: 'POST', headers: csrfHeaders(),
      body: JSON.stringify({ expectedVersion: item.version, expectedRevision: item.revision, reason })
    })
  );

export const bulkKnowledgeAction = async (
  itemIds: string[],
  action: 'publish' | 'archive',
  reason: string
): Promise<KnowledgeItem[]> =>
  knowledgeBulkResponseSchema.parse(
    await requestJson('/api/admin/v1/ai-chatbot/knowledge/bulk-action', {
      method: 'POST', headers: csrfHeaders(), body: JSON.stringify({ itemIds, action, reason })
    })
  ).data;

export const reindexKnowledge = async (knowledgeId: string): Promise<void> => {
  await requestJson(`/api/admin/v1/ai-chatbot/knowledge/${encodeURIComponent(knowledgeId)}/reindex`, {
    method: 'POST', headers: csrfHeaders()
  });
};
