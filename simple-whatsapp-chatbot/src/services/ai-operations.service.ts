import { randomUUID } from 'node:crypto';
import { pool } from '../database/connection.js';
import { AppError } from '../middleware/error.middleware.js';
import { maskPhoneNumber } from '../utils/phone.js';
import type { QueryExecutor } from './message.service.js';
import { AiRagRuntimeService, type RagResult } from './ai-rag-runtime.service.js';
import { KnowledgeService, type KnowledgeItem } from './knowledge.service.js';

export type FeedbackType =
  | 'correct' | 'incorrect' | 'incomplete' | 'unsafe'
  | 'wrong_source' | 'too_long' | 'too_promotional';
export type UnansweredStatus =
  | 'new' | 'reviewing' | 'knowledge_created' | 'ignored' | 'resolved';

const asStrings = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string') : [];
const recordValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const iso = (value: Date | string): string => value instanceof Date ? value.toISOString() : value;
const offsetCursor = (value: string | undefined): number => {
  if (value === undefined) return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new AppError('Cursor is invalid', 400, 'AI_OPERATIONS_CURSOR_INVALID');
  }
  return parsed;
};

type ConversationRow = {
  id: string; contact_id: string; channel: 'whatsapp' | 'playground';
  channel_session_id: string; status: 'active' | 'handed_off' | 'closed';
  topic: string | null; is_interested: boolean; summary: string | null;
  last_knowledge_ids: unknown; handoff_status: string | null;
  started_at: Date | string; last_message_at: Date | string; closed_at: Date | string | null;
  display_name: string | null; phone_number: string | null;
  trace_count: string; fallback_count: string; handoff_required: boolean;
  last_answer_status: string | null; last_model: string | null;
  last_trace_id: string | null; reviewed_by: string | null;
  anonymized_at: Date | string | null;
};

const conversationFromRow = (row: ConversationRow) => ({
  id: row.id,
  contactId: row.contact_id,
  customer: {
    displayName: row.anonymized_at ? null : row.display_name,
    maskedIdentifier: row.anonymized_at ? 'Anonymous' : row.phone_number ? maskPhoneNumber(row.phone_number) : 'Playground'
  },
  channel: row.channel,
  channelSessionId: row.channel_session_id,
  status: row.status,
  topic: row.topic,
  interested: row.is_interested,
  summary: row.summary,
  lastKnowledgeIds: asStrings(row.last_knowledge_ids),
  handoffStatus: row.handoff_status,
  traceCount: Number(row.trace_count),
  fallbackCount: Number(row.fallback_count),
  handoff: row.handoff_required,
  lastAnswerStatus: row.last_answer_status,
  lastModel: row.last_model,
  lastTraceId: row.last_trace_id,
  reviewedBy: row.reviewed_by,
  startedAt: iso(row.started_at),
  lastMessageAt: iso(row.last_message_at),
  closedAt: row.closed_at ? iso(row.closed_at) : null
});

const conversationSelect = `
  SELECT conversation.id, conversation.contact_id::text, conversation.channel,
    conversation.channel_session_id, conversation.status, conversation.topic,
    conversation.is_interested, conversation.summary, conversation.last_knowledge_ids,
    conversation.handoff_status, conversation.started_at, conversation.last_message_at,
    conversation.closed_at, conversation.anonymized_at, contact.display_name, contact.phone_number,
    COUNT(trace.id)::text AS trace_count,
    COUNT(trace.id) FILTER (WHERE trace.answer_status IN ('unsupported', 'safety_fallback'))::text AS fallback_count,
    COALESCE(BOOL_OR(trace.handoff_required), FALSE) AS handoff_required,
    (ARRAY_AGG(trace.answer_status ORDER BY trace.created_at DESC) FILTER (WHERE trace.id IS NOT NULL))[1] AS last_answer_status,
    (ARRAY_AGG(trace.model ORDER BY trace.created_at DESC) FILTER (WHERE trace.model IS NOT NULL))[1] AS last_model,
    (ARRAY_AGG(trace.trace_id ORDER BY trace.created_at DESC) FILTER (WHERE trace.id IS NOT NULL))[1] AS last_trace_id,
    (ARRAY_AGG(feedback.reviewer_id::text ORDER BY feedback.reviewed_at DESC) FILTER (WHERE feedback.id IS NOT NULL))[1] AS reviewed_by
  FROM ai_conversations conversation
  INNER JOIN contacts contact ON contact.id = conversation.contact_id
  LEFT JOIN ai_message_traces trace
    ON trace.tenant_id = conversation.tenant_id AND trace.ai_conversation_id = conversation.id
  LEFT JOIN ai_admin_feedback feedback
    ON feedback.tenant_id = trace.tenant_id AND feedback.ai_message_trace_id = trace.id
`;

export type TestCaseInput = {
  name: string;
  question: string;
  recentContext: string[];
  promptVersionId: string | null;
  expectedCategory: string | null;
  expectedKnowledgeIds: string[];
  mustContain: string[];
  mustNotContain: string[];
  expectedHandoff: boolean | null;
  active: boolean;
};

export type AiOperationalSettingsInput = {
  logRetentionDays: number;
  cacheTtlSeconds: number;
  dailyBudgetUsd: number | null;
  chatInputCostPerMillionUsd: number | null;
  chatOutputCostPerMillionUsd: number | null;
  embeddingCostPerMillionUsd: number | null;
  fallbackAlertRate: number;
  latencyAlertMs: number;
  queueAlertDepth: number;
  expectedRevision: number;
};
export const releaseGateKeys = [
  'knowledge', 'uat', 'medical', 'security', 'monitoring', 'rollback',
  'admin_training', 'alert_owner', 'handoff_owner', 'product'
] as const;
export type ReleaseGateKey = typeof releaseGateKeys[number];

type TestCaseRow = {
  id: string; name: string; question: string; recent_context: unknown;
  prompt_version_id: string | null; expected_category: string | null;
  expected_knowledge_ids: unknown; must_contain: unknown; must_not_contain: unknown;
  expected_handoff: boolean | null; active: boolean; created_by: string;
  updated_by: string; created_at: Date | string; updated_at: Date | string;
};

const testCaseFromRow = (row: TestCaseRow) => ({
  id: row.id, name: row.name, question: row.question,
  recentContext: asStrings(row.recent_context), promptVersionId: row.prompt_version_id,
  expectedCategory: row.expected_category,
  expectedKnowledgeIds: asStrings(row.expected_knowledge_ids),
  mustContain: asStrings(row.must_contain), mustNotContain: asStrings(row.must_not_contain),
  expectedHandoff: row.expected_handoff, active: row.active,
  createdBy: row.created_by, updatedBy: row.updated_by,
  createdAt: iso(row.created_at), updatedAt: iso(row.updated_at)
});

type UnansweredRow = {
  id: string; sample_question: string; normalized_question: string;
  occurrence_count: number; best_similarity: string | number | null;
  nearest_knowledge_ids: unknown; predicted_category_id: string | null;
  predicted_category_name: string | null; status: UnansweredStatus;
  reviewed_by: string | null; resolved_knowledge_item_id: string | null;
  review_note: string | null; first_seen_at: Date | string; last_seen_at: Date | string;
  conversation_ids: unknown;
};

const unansweredFromRow = (row: UnansweredRow) => ({
  id: row.id, sampleQuestion: row.sample_question,
  normalizedQuestion: row.normalized_question,
  occurrenceCount: Number(row.occurrence_count),
  bestSimilarity: row.best_similarity === null ? null : Number(row.best_similarity),
  nearestKnowledgeIds: asStrings(row.nearest_knowledge_ids),
  predictedCategoryId: row.predicted_category_id,
  predictedCategoryName: row.predicted_category_name,
  status: row.status, reviewedBy: row.reviewed_by,
  resolvedKnowledgeItemId: row.resolved_knowledge_item_id,
  reviewNote: row.review_note,
  conversationIds: asStrings(row.conversation_ids),
  firstSeenAt: iso(row.first_seen_at), lastSeenAt: iso(row.last_seen_at)
});

export class AiOperationsService {
  constructor(
    private readonly database: QueryExecutor = pool,
    private readonly runtime = new AiRagRuntimeService(database),
    private readonly knowledge = new KnowledgeService(database)
  ) {}

  private async assertPrompt(tenantId: string, promptVersionId: string | null): Promise<void> {
    if (!promptVersionId) return;
    const result = await this.database.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM ai_prompt_versions WHERE tenant_id = $1 AND id = $2) AS exists;`,
      [tenantId, promptVersionId]
    );
    if (!result.rows[0]?.exists) throw new AppError('Prompt version was not found', 404, 'AI_PROMPT_NOT_FOUND');
  }

  private async assertKnowledgeChunks(tenantId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const result = await this.database.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM knowledge_chunks
       WHERE tenant_id = $1 AND id = ANY($2::uuid[]);`, [tenantId, ids]
    );
    if (Number(result.rows[0]?.count ?? 0) !== new Set(ids).size) {
      throw new AppError('One or more knowledge sources were not found', 404, 'KNOWLEDGE_SOURCE_NOT_FOUND');
    }
  }

  async listConversations(tenantId: string, input: {
    limit?: number; cursor?: string; query?: string; channel?: string;
    answerStatus?: string; fallback?: boolean; handoff?: boolean;
    lowConfidence?: boolean; unanswered?: boolean; categoryId?: string;
    model?: string; reviewerId?: string; from?: string; to?: string;
  }) {
    const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
    const offset = offsetCursor(input.cursor);
    const values: unknown[] = [tenantId];
    const where = ['conversation.tenant_id = $1'];
    const add = (sql: string, value: unknown) => {
      values.push(value); where.push(sql.replaceAll('?', `$${values.length}`));
    };
    if (input.query) add('(contact.display_name ILIKE \'%\' || ? || \'%\' OR contact.phone_number ILIKE \'%\' || ? || \'%\' OR conversation.summary ILIKE \'%\' || ? || \'%\')', input.query);
    if (input.channel) add('conversation.channel = ?', input.channel);
    if (input.from) add('conversation.last_message_at >= ?::timestamptz', input.from);
    if (input.to) add('conversation.last_message_at <= ?::timestamptz', input.to);
    if (input.answerStatus) add('EXISTS (SELECT 1 FROM ai_message_traces filter_trace WHERE filter_trace.tenant_id = conversation.tenant_id AND filter_trace.ai_conversation_id = conversation.id AND filter_trace.answer_status = ?)', input.answerStatus);
    if (input.model) add('EXISTS (SELECT 1 FROM ai_message_traces filter_trace WHERE filter_trace.tenant_id = conversation.tenant_id AND filter_trace.ai_conversation_id = conversation.id AND filter_trace.model = ?)', input.model);
    if (input.reviewerId) add('EXISTS (SELECT 1 FROM ai_message_traces ft JOIN ai_admin_feedback ff ON ff.ai_message_trace_id = ft.id AND ff.tenant_id = ft.tenant_id WHERE ft.tenant_id = conversation.tenant_id AND ft.ai_conversation_id = conversation.id AND ff.reviewer_id = ?::uuid)', input.reviewerId);
    if (input.categoryId) add('EXISTS (SELECT 1 FROM ai_message_traces ft JOIN ai_message_sources fs ON fs.ai_message_trace_id = ft.id JOIN knowledge_chunks fc ON fc.id = fs.knowledge_chunk_id WHERE ft.tenant_id = conversation.tenant_id AND ft.ai_conversation_id = conversation.id AND fc.category_id = ?::uuid)', input.categoryId);
    if (input.fallback !== undefined) where.push(input.fallback
      ? "EXISTS (SELECT 1 FROM ai_message_traces ft WHERE ft.tenant_id = conversation.tenant_id AND ft.ai_conversation_id = conversation.id AND ft.fallback_reason IS NOT NULL)"
      : "NOT EXISTS (SELECT 1 FROM ai_message_traces ft WHERE ft.tenant_id = conversation.tenant_id AND ft.ai_conversation_id = conversation.id AND ft.fallback_reason IS NOT NULL)");
    if (input.handoff !== undefined) where.push(input.handoff
      ? 'EXISTS (SELECT 1 FROM ai_message_traces ft WHERE ft.tenant_id = conversation.tenant_id AND ft.ai_conversation_id = conversation.id AND ft.handoff_required = TRUE)'
      : 'NOT EXISTS (SELECT 1 FROM ai_message_traces ft WHERE ft.tenant_id = conversation.tenant_id AND ft.ai_conversation_id = conversation.id AND ft.handoff_required = TRUE)');
    if (input.lowConfidence) where.push('EXISTS (SELECT 1 FROM ai_message_traces ft WHERE ft.tenant_id = conversation.tenant_id AND ft.ai_conversation_id = conversation.id AND (ft.best_similarity IS NULL OR ft.answer_status IN (\'unsupported\', \'partially_supported\')))');
    if (input.unanswered) where.push('EXISTS (SELECT 1 FROM ai_message_traces ft JOIN unanswered_question_occurrences occurrence ON occurrence.ai_message_trace_id = ft.id AND occurrence.tenant_id = ft.tenant_id WHERE ft.tenant_id = conversation.tenant_id AND ft.ai_conversation_id = conversation.id)');
    values.push(limit + 1, offset);
    const result = await this.database.query<ConversationRow>(
      `${conversationSelect} WHERE ${where.join(' AND ')}
       GROUP BY conversation.id, contact.id
       ORDER BY conversation.last_message_at DESC, conversation.id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length};`, values
    );
    const hasMore = result.rows.length > limit;
    return { data: result.rows.slice(0, limit).map(conversationFromRow), nextCursor: hasMore ? String(offset + limit) : null };
  }

  async getConversation(tenantId: string, id: string) {
    const result = await this.database.query<ConversationRow>(
      `${conversationSelect} WHERE conversation.tenant_id = $1 AND conversation.id = $2
       GROUP BY conversation.id, contact.id;`, [tenantId, id]
    );
    if (!result.rows[0]) throw new AppError('AI conversation was not found', 404, 'AI_CONVERSATION_NOT_FOUND');
    return conversationFromRow(result.rows[0]);
  }

  async listConversationMessages(tenantId: string, conversationId: string, input: { limit?: number; cursor?: string }) {
    await this.getConversation(tenantId, conversationId);
    const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
    const offset = offsetCursor(input.cursor);
    const result = await this.database.query<{
      id: string; source_message_id: string; response_message_id: string | null;
      customer_message: string; assistant_message: string | null; answer_status: string;
      validation_status: string; fallback_reason: string | null; safety_category: string;
      handoff_required: boolean; requires_disclaimer: boolean; model: string | null;
      prompt_version_id: string | null; input_tokens: number; output_tokens: number;
      retrieval_latency_ms: number; provider_latency_ms: number; total_latency_ms: number;
      trace_id: string; created_at: Date | string; sources: unknown;
      feedback_id: string | null; feedback_type: FeedbackType | null; feedback_comment: string | null;
      correct_knowledge_ids: unknown; suggested_answer: string | null; reviewer_id: string | null;
      reviewed_at: Date | string | null;
      cache_hit: boolean;
    }>(
      `SELECT trace.id, trace.source_message_id::text, trace.response_message_id::text,
        source.content AS customer_message, response.content AS assistant_message,
        trace.answer_status, trace.validation_status, trace.fallback_reason,
        trace.safety_category, trace.handoff_required, trace.requires_disclaimer,
        trace.model, trace.prompt_version_id, trace.input_tokens, trace.output_tokens,
        trace.retrieval_latency_ms, trace.provider_latency_ms, trace.total_latency_ms,
        trace.trace_id, trace.created_at, trace.cache_hit,
        COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
          'chunkId', chunk.id, 'title', chunk.title, 'section', chunk.section,
          'sourceType', COALESCE(chunk.metadata->>'sourceType', 'knowledge'),
          'score', message_source.similarity_score, 'rank', message_source.rank,
          'usedInPrompt', message_source.used_in_prompt,
          'usedInAnswer', message_source.used_in_answer,
          'knowledgeVersionId', chunk.knowledge_item_version_id,
          'documentId', chunk.document_id
        ) ORDER BY message_source.rank) FILTER (WHERE chunk.id IS NOT NULL), '[]'::jsonb) AS sources,
        feedback.id AS feedback_id, feedback.feedback_type,
        feedback.comment AS feedback_comment, feedback.correct_knowledge_ids,
        feedback.suggested_answer, feedback.reviewer_id::text, feedback.reviewed_at
       FROM ai_message_traces trace
       INNER JOIN messages source ON source.id = trace.source_message_id
       LEFT JOIN messages response ON response.id = trace.response_message_id
       LEFT JOIN ai_message_sources message_source ON message_source.ai_message_trace_id = trace.id
       LEFT JOIN knowledge_chunks chunk ON chunk.id = message_source.knowledge_chunk_id
       LEFT JOIN ai_admin_feedback feedback
         ON feedback.tenant_id = trace.tenant_id AND feedback.ai_message_trace_id = trace.id
       WHERE trace.tenant_id = $1 AND trace.ai_conversation_id = $2
       GROUP BY trace.id, source.id, response.id, feedback.id
       ORDER BY trace.created_at DESC, trace.id DESC LIMIT $3 OFFSET $4;`,
      [tenantId, conversationId, limit + 1, offset]
    );
    const hasMore = result.rows.length > limit;
    return {
      data: result.rows.slice(0, limit).map((row) => ({
        id: row.id, sourceMessageId: row.source_message_id,
        responseMessageId: row.response_message_id,
        customerMessage: row.customer_message,
        assistantMessage: row.assistant_message,
        answerStatus: row.answer_status, validationStatus: row.validation_status,
        fallbackReason: row.fallback_reason, safetyCategory: row.safety_category,
        handoff: row.handoff_required, requiresDisclaimer: row.requires_disclaimer,
        model: row.model, promptVersionId: row.prompt_version_id,
        inputTokens: row.input_tokens, outputTokens: row.output_tokens,
        retrievalLatencyMs: row.retrieval_latency_ms,
        providerLatencyMs: row.provider_latency_ms, latencyMs: row.total_latency_ms,
        traceId: row.trace_id, cacheHit: row.cache_hit,
        sources: Array.isArray(row.sources) ? row.sources : [],
        feedback: row.feedback_id ? {
          id: row.feedback_id, type: row.feedback_type, comment: row.feedback_comment,
          correctKnowledgeIds: asStrings(row.correct_knowledge_ids),
          suggestedAnswer: row.suggested_answer, reviewerId: row.reviewer_id,
          reviewedAt: row.reviewed_at ? iso(row.reviewed_at) : null
        } : null,
        createdAt: iso(row.created_at)
      })),
      nextCursor: hasMore ? String(offset + limit) : null
    };
  }

  async saveFeedback(tenantId: string, traceId: string, reviewerId: string, input: {
    type: FeedbackType; comment: string | null; correctKnowledgeIds: string[]; suggestedAnswer: string | null;
  }) {
    await this.assertKnowledgeChunks(tenantId, input.correctKnowledgeIds);
    const result = await this.database.query<{
      id: string; feedback_type: FeedbackType; comment: string | null;
      correct_knowledge_ids: unknown; suggested_answer: string | null;
      reviewer_id: string; reviewed_at: Date | string;
    }>(
      `INSERT INTO ai_admin_feedback (
         id, tenant_id, ai_message_trace_id, feedback_type, comment,
         correct_knowledge_ids, suggested_answer, reviewer_id
       ) SELECT $1,$2,trace.id,$4,$5,$6::jsonb,$7,$8
         FROM ai_message_traces trace WHERE trace.tenant_id = $2 AND trace.id = $3
       ON CONFLICT (tenant_id, ai_message_trace_id) DO UPDATE SET
         feedback_type = EXCLUDED.feedback_type, comment = EXCLUDED.comment,
         correct_knowledge_ids = EXCLUDED.correct_knowledge_ids,
         suggested_answer = EXCLUDED.suggested_answer,
         reviewer_id = EXCLUDED.reviewer_id, reviewed_at = NOW(), updated_at = NOW()
       RETURNING id, feedback_type, comment, correct_knowledge_ids,
         suggested_answer, reviewer_id::text, reviewed_at;`,
      [randomUUID(), tenantId, traceId, input.type, input.comment,
        JSON.stringify(input.correctKnowledgeIds), input.suggestedAnswer, reviewerId]
    );
    const row = result.rows[0];
    if (!row) throw new AppError('AI message trace was not found', 404, 'AI_TRACE_NOT_FOUND');
    return { id: row.id, type: row.feedback_type, comment: row.comment,
      correctKnowledgeIds: asStrings(row.correct_knowledge_ids), suggestedAnswer: row.suggested_answer,
      reviewerId: row.reviewer_id, reviewedAt: iso(row.reviewed_at) };
  }

  async listUnanswered(tenantId: string, input: { status?: UnansweredStatus | 'all'; query?: string; limit?: number; cursor?: string }) {
    const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
    const offset = offsetCursor(input.cursor);
    const values: unknown[] = [tenantId];
    const where = ['unanswered.tenant_id = $1'];
    if (input.status && input.status !== 'all') { values.push(input.status); where.push(`unanswered.status = $${values.length}`); }
    if (input.query) { values.push(input.query); where.push(`unanswered.sample_question ILIKE '%' || $${values.length} || '%'`); }
    values.push(limit + 1, offset);
    const result = await this.database.query<UnansweredRow>(
      `SELECT unanswered.*, category.name AS predicted_category_name,
        COALESCE(JSONB_AGG(DISTINCT trace.ai_conversation_id::text)
          FILTER (WHERE trace.id IS NOT NULL), '[]'::jsonb) AS conversation_ids
       FROM unanswered_questions unanswered
       LEFT JOIN knowledge_categories category
         ON category.tenant_id = unanswered.tenant_id AND category.id = unanswered.predicted_category_id
       LEFT JOIN unanswered_question_occurrences occurrence
         ON occurrence.tenant_id = unanswered.tenant_id AND occurrence.unanswered_question_id = unanswered.id
       LEFT JOIN ai_message_traces trace ON trace.id = occurrence.ai_message_trace_id
       WHERE ${where.join(' AND ')} GROUP BY unanswered.id, category.id
       ORDER BY unanswered.last_seen_at DESC, unanswered.id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length};`, values
    );
    const hasMore = result.rows.length > limit;
    return { data: result.rows.slice(0, limit).map(unansweredFromRow), nextCursor: hasMore ? String(offset + limit) : null };
  }

  async updateUnanswered(tenantId: string, id: string, reviewerId: string, input: {
    status: UnansweredStatus; predictedCategoryId?: string | null;
    resolvedKnowledgeItemId?: string | null; reviewNote?: string | null;
  }) {
    const result = await this.database.query<UnansweredRow>(
      `UPDATE unanswered_questions SET status = $3,
         predicted_category_id = COALESCE($4::uuid, predicted_category_id),
         resolved_knowledge_item_id = COALESCE($5::uuid, resolved_knowledge_item_id),
         review_note = $6, reviewed_by = $7, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 RETURNING *, NULL::text AS predicted_category_name,
         '[]'::jsonb AS conversation_ids;`,
      [tenantId, id, input.status, input.predictedCategoryId ?? null,
        input.resolvedKnowledgeItemId ?? null, input.reviewNote ?? null, reviewerId]
    );
    if (!result.rows[0]) throw new AppError('Unanswered question was not found', 404, 'UNANSWERED_NOT_FOUND');
    return unansweredFromRow(result.rows[0]);
  }

  async createKnowledgeFromUnanswered(tenantId: string, id: string, actorId: string, input: {
    answer: string; categoryId: string | null; title?: string; requiresDisclaimer?: boolean;
  }): Promise<{ unanswered: ReturnType<typeof unansweredFromRow>; knowledge: KnowledgeItem }> {
    const result = await this.database.query<UnansweredRow>(
      `SELECT unanswered.*, category.name AS predicted_category_name,
         '[]'::jsonb AS conversation_ids FROM unanswered_questions unanswered
       LEFT JOIN knowledge_categories category ON category.tenant_id = unanswered.tenant_id
         AND category.id = unanswered.predicted_category_id
       WHERE unanswered.tenant_id = $1 AND unanswered.id = $2;`, [tenantId, id]
    );
    const row = result.rows[0];
    if (!row) throw new AppError('Unanswered question was not found', 404, 'UNANSWERED_NOT_FOUND');
    if (row.status === 'knowledge_created' || row.resolved_knowledge_item_id) {
      throw new AppError('Draft knowledge was already created', 409, 'UNANSWERED_KNOWLEDGE_EXISTS');
    }
    const knowledge = await this.knowledge.createKnowledge(tenantId, actorId, {
      categoryId: input.categoryId ?? row.predicted_category_id,
      sourceType: 'faq',
      title: input.title?.trim() || row.sample_question.slice(0, 255),
      question: row.sample_question,
      questionVariants: [], content: input.answer,
      sourceReference: null,
      internalNotes: `Dibuat dari Unanswered Question ${id}. Memerlukan review sebelum publish.`,
      tags: ['unanswered-question'], metadata: { unansweredQuestionId: id },
      requiresDisclaimer: input.requiresDisclaimer ?? false,
      priority: 0, validFrom: null, validUntil: null
    });
    const unanswered = await this.updateUnanswered(tenantId, id, actorId, {
      status: 'knowledge_created', resolvedKnowledgeItemId: knowledge.id,
      reviewNote: 'Draft FAQ dibuat; menunggu review dan publish.'
    });
    return { unanswered, knowledge };
  }

  async listTestCases(tenantId: string) {
    const result = await this.database.query<TestCaseRow>(
      'SELECT * FROM ai_test_cases WHERE tenant_id = $1 ORDER BY updated_at DESC, id DESC LIMIT 200;', [tenantId]
    );
    return Promise.all(result.rows.map(async (row) => ({
      ...testCaseFromRow(row), runs: await this.listRuns(tenantId, row.id, 2)
    })));
  }

  async importTestCases(tenantId: string, actorId: string, inputs: TestCaseInput[]) {
    if (inputs.length < 1 || inputs.length > 300) {
      throw new AppError('Evaluation import must contain 1 to 300 test cases', 400, 'AI_EVALUATION_IMPORT_INVALID');
    }
    const created = [];
    for (const input of inputs) created.push(await this.createTestCase(tenantId, actorId, input));
    return { imported: created.length, testCases: created };
  }

  async createTestCase(tenantId: string, actorId: string, input: TestCaseInput) {
    await this.assertPrompt(tenantId, input.promptVersionId);
    await this.assertKnowledgeChunks(tenantId, input.expectedKnowledgeIds);
    const result = await this.database.query<TestCaseRow>(
      `INSERT INTO ai_test_cases (
         id, tenant_id, name, question, recent_context, prompt_version_id,
         expected_category, expected_knowledge_ids, must_contain, must_not_contain,
         expected_handoff, active, created_by, updated_by
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13,$13)
       RETURNING *;`, [randomUUID(), tenantId, input.name, input.question,
        JSON.stringify(input.recentContext), input.promptVersionId, input.expectedCategory,
        JSON.stringify(input.expectedKnowledgeIds), JSON.stringify(input.mustContain),
        JSON.stringify(input.mustNotContain), input.expectedHandoff, input.active, actorId]
    );
    return { ...testCaseFromRow(result.rows[0]!), runs: [] };
  }

  async updateTestCase(tenantId: string, id: string, actorId: string, input: TestCaseInput) {
    await this.assertPrompt(tenantId, input.promptVersionId);
    await this.assertKnowledgeChunks(tenantId, input.expectedKnowledgeIds);
    const result = await this.database.query<TestCaseRow>(
      `UPDATE ai_test_cases SET name=$3, question=$4, recent_context=$5::jsonb,
         prompt_version_id=$6, expected_category=$7, expected_knowledge_ids=$8::jsonb,
         must_contain=$9::jsonb, must_not_contain=$10::jsonb,
         expected_handoff=$11, active=$12, updated_by=$13, updated_at=NOW()
       WHERE tenant_id=$1 AND id=$2 RETURNING *;`, [tenantId, id, input.name,
        input.question, JSON.stringify(input.recentContext), input.promptVersionId,
        input.expectedCategory, JSON.stringify(input.expectedKnowledgeIds),
        JSON.stringify(input.mustContain), JSON.stringify(input.mustNotContain),
        input.expectedHandoff, input.active, actorId]
    );
    if (!result.rows[0]) throw new AppError('Test case was not found', 404, 'AI_TEST_CASE_NOT_FOUND');
    return { ...testCaseFromRow(result.rows[0]), runs: await this.listRuns(tenantId, id, 2) };
  }

  private score(testCase: ReturnType<typeof testCaseFromRow>, result: RagResult) {
    const answer = result.reply.toLocaleLowerCase('id-ID');
    const usedIds = new Set(result.usedKnowledge.map((source) => source.chunkId));
    const checks: Record<string, boolean> = {
      category: !testCase.expectedCategory || result.safetyCategory === testCase.expectedCategory,
      knowledge: testCase.expectedKnowledgeIds.every((id) => usedIds.has(id)),
      mustContain: testCase.mustContain.every((term) => answer.includes(term.toLocaleLowerCase('id-ID'))),
      mustNotContain: testCase.mustNotContain.every((term) => !answer.includes(term.toLocaleLowerCase('id-ID'))),
      handoff: testCase.expectedHandoff === null || result.handoff === testCase.expectedHandoff
    };
    const values = Object.values(checks);
    return { checks, score: values.filter(Boolean).length / values.length, passed: values.every(Boolean) };
  }

  async runTestCase(tenantId: string, id: string, actorId: string) {
    const result = await this.database.query<TestCaseRow>(
      'SELECT * FROM ai_test_cases WHERE tenant_id = $1 AND id = $2 AND active = TRUE;', [tenantId, id]
    );
    const row = result.rows[0];
    if (!row) throw new AppError('Active test case was not found', 404, 'AI_TEST_CASE_NOT_FOUND');
    const testCase = testCaseFromRow(row);
    const response = await this.runtime.respond({
      tenantId, channel: 'playground', channelSessionId: `test-case:${id}`,
      customerIdentifier: `test-case:${id}`, providerMessageId: `test-case:${randomUUID()}`,
      message: testCase.question, timestamp: new Date().toISOString(),
      requireActiveIntegration: false, promptVersionId: testCase.promptVersionId,
      recentContext: testCase.recentContext, ignoreStoredMemory: true
    });
    const scoring = this.score(testCase, response);
    const trace = await this.database.query<{ id: string }>(
      'SELECT id FROM ai_message_traces WHERE tenant_id = $1 AND trace_id = $2;', [tenantId, response.traceId]
    );
    const run = await this.database.query<{ id: string; ran_at: Date | string }>(
      `INSERT INTO ai_test_case_runs (
         id, tenant_id, test_case_id, ai_message_trace_id, passed, score,
         checks, answer_status, answer_preview, trace_id, run_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11) RETURNING id, ran_at;`,
      [randomUUID(), tenantId, id, trace.rows[0]?.id ?? null, scoring.passed,
        scoring.score, JSON.stringify(scoring.checks), response.answerStatus,
        response.reply.slice(0, 500), response.traceId, actorId]
    );
    return { id: run.rows[0]!.id, testCaseId: id, ...scoring,
      answerStatus: response.answerStatus, answerPreview: response.reply.slice(0, 500),
      traceId: response.traceId, ranAt: iso(run.rows[0]!.ran_at), result: response };
  }

  async runBatch(tenantId: string, actorId: string, ids?: string[]) {
    const cases = ids?.length ? ids : (await this.database.query<{ id: string }>(
      'SELECT id FROM ai_test_cases WHERE tenant_id = $1 AND active = TRUE ORDER BY updated_at DESC LIMIT 100;', [tenantId]
    )).rows.map((row) => row.id);
    const runs = [];
    for (const id of cases.slice(0, 100)) runs.push(await this.runTestCase(tenantId, id, actorId));
    const passed = runs.filter((run) => run.passed).length;
    return { total: runs.length, passed, failed: runs.length - passed,
      passRate: runs.length ? passed / runs.length : 0, runs };
  }

  async listRuns(tenantId: string, testCaseId: string, limit = 20) {
    const result = await this.database.query<{
      id: string; passed: boolean; score: string | number; checks: unknown;
      answer_status: string; answer_preview: string; trace_id: string; ran_at: Date | string;
    }>(
      `SELECT id, passed, score, checks, answer_status, answer_preview, trace_id, ran_at
       FROM ai_test_case_runs WHERE tenant_id = $1 AND test_case_id = $2
       ORDER BY ran_at DESC LIMIT $3;`, [tenantId, testCaseId, limit]
    );
    return result.rows.map((row) => ({ id: row.id, passed: row.passed,
      score: Number(row.score), checks: row.checks, answerStatus: row.answer_status,
      answerPreview: row.answer_preview, traceId: row.trace_id, ranAt: iso(row.ran_at) }));
  }

  async getOperationalSettings(tenantId: string) {
    const result = await this.database.query<{
      log_retention_days: number; cache_ttl_seconds: number; daily_budget_usd: string | number | null;
      chat_input_cost_per_million_usd: string | number | null;
      chat_output_cost_per_million_usd: string | number | null;
      embedding_cost_per_million_usd: string | number | null;
      fallback_alert_rate: string | number; latency_alert_ms: number;
      queue_alert_depth: number; revision: number; updated_at: Date | string;
    }>(`INSERT INTO ai_operational_settings (tenant_id) VALUES ($1)
        ON CONFLICT (tenant_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
        RETURNING *;`, [tenantId]);
    const row = result.rows[0]!;
    const numberOrNull = (value: string | number | null) => value === null ? null : Number(value);
    return {
      logRetentionDays: row.log_retention_days, cacheTtlSeconds: row.cache_ttl_seconds,
      dailyBudgetUsd: numberOrNull(row.daily_budget_usd),
      chatInputCostPerMillionUsd: numberOrNull(row.chat_input_cost_per_million_usd),
      chatOutputCostPerMillionUsd: numberOrNull(row.chat_output_cost_per_million_usd),
      embeddingCostPerMillionUsd: numberOrNull(row.embedding_cost_per_million_usd),
      fallbackAlertRate: Number(row.fallback_alert_rate), latencyAlertMs: row.latency_alert_ms,
      queueAlertDepth: row.queue_alert_depth, revision: row.revision, updatedAt: iso(row.updated_at)
    };
  }

  async updateOperationalSettings(tenantId: string, actorId: string, input: AiOperationalSettingsInput) {
    const result = await this.database.query(
      `UPDATE ai_operational_settings SET log_retention_days=$3, cache_ttl_seconds=$4,
         daily_budget_usd=$5, chat_input_cost_per_million_usd=$6,
         chat_output_cost_per_million_usd=$7, embedding_cost_per_million_usd=$8,
         fallback_alert_rate=$9, latency_alert_ms=$10, queue_alert_depth=$11,
         revision=revision+1, updated_by=$12, updated_at=NOW()
       WHERE tenant_id=$1 AND revision=$2 RETURNING tenant_id;`,
      [tenantId, input.expectedRevision, input.logRetentionDays, input.cacheTtlSeconds,
        input.dailyBudgetUsd, input.chatInputCostPerMillionUsd,
        input.chatOutputCostPerMillionUsd, input.embeddingCostPerMillionUsd,
        input.fallbackAlertRate, input.latencyAlertMs, input.queueAlertDepth, actorId]
    );
    if (!result.rows[0]) throw new AppError('Operational settings revision conflict', 409, 'AI_SETTINGS_REVISION_CONFLICT');
    return this.getOperationalSettings(tenantId);
  }

  async getAnalytics(tenantId: string, from: string, to: string) {
    const settings = await this.getOperationalSettings(tenantId);
    const summary = await this.database.query<Record<string, string | number | null>>(
      `WITH traces AS (
         SELECT trace.*, EXISTS(SELECT 1 FROM ai_message_sources source
           WHERE source.ai_message_trace_id=trace.id AND source.used_in_prompt) AS has_context
         FROM ai_message_traces trace
         WHERE trace.tenant_id=$1 AND trace.created_at >= $2::timestamptz AND trace.created_at < $3::timestamptz
       ), feedback AS (
         SELECT COUNT(*)::int reviewed,
           COUNT(*) FILTER (WHERE feedback_type <> 'correct')::int corrected
         FROM ai_admin_feedback WHERE tenant_id=$1 AND reviewed_at >= $2::timestamptz AND reviewed_at < $3::timestamptz
       ) SELECT COUNT(*)::int total,
         COUNT(*) FILTER (WHERE answer_status IN ('supported','partially_supported'))::int answered,
         COUNT(*) FILTER (WHERE answer_status='supported')::int supported,
         COUNT(*) FILTER (WHERE answer_status IN ('unsupported','safety_fallback'))::int fallback,
         COUNT(*) FILTER (WHERE handoff_required)::int handoff,
         COUNT(*) FILTER (WHERE customer_interest)::int interest,
         COUNT(*) FILTER (WHERE answer_status='unsupported')::int unanswered,
         COUNT(*) FILTER (WHERE has_context)::int covered,
         COUNT(*) FILTER (WHERE validation_status='provider_error')::int errors,
         COUNT(*) FILTER (WHERE cache_hit)::int cache_hits,
         COALESCE(AVG(total_latency_ms),0)::numeric avg_latency,
         COALESCE(AVG(retrieval_latency_ms),0)::numeric avg_retrieval_latency,
         COALESCE(AVG(provider_latency_ms),0)::numeric avg_provider_latency,
         COALESCE(AVG(best_similarity),0)::numeric avg_similarity,
         COALESCE(SUM(input_tokens),0)::bigint input_tokens,
         COALESCE(SUM(output_tokens),0)::bigint output_tokens,
         (SELECT reviewed FROM feedback)::int reviewed,
         (SELECT corrected FROM feedback)::int corrected
       FROM traces;`, [tenantId, from, to]
    );
    const counts = summary.rows[0]!;
    const total = Number(counts.total ?? 0);
    const answered = Number(counts.answered ?? 0);
    const ratio = (value: unknown, denominator = total) => denominator ? Number(value ?? 0) / denominator : 0;
    const chatCost = settings.chatInputCostPerMillionUsd === null || settings.chatOutputCostPerMillionUsd === null
      ? null : (Number(counts.input_tokens ?? 0) * settings.chatInputCostPerMillionUsd +
        Number(counts.output_tokens ?? 0) * settings.chatOutputCostPerMillionUsd) / 1_000_000;
    const embedding = await this.database.query<{ tokens: string; stored_cost: string | number | null }>(
      `SELECT COALESCE(SUM(token_count),0)::text tokens, SUM(estimated_cost_usd) stored_cost
       FROM ai_embedding_usage_logs WHERE tenant_id=$1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz;`,
      [tenantId, from, to]
    );
    const embeddingTokens = Number(embedding.rows[0]?.tokens ?? 0);
    const embeddingCost = settings.embeddingCostPerMillionUsd === null
      ? (embedding.rows[0]?.stored_cost === null ? null : Number(embedding.rows[0]?.stored_cost))
      : embeddingTokens * settings.embeddingCostPerMillionUsd / 1_000_000;
    const totalCost = chatCost === null && embeddingCost === null ? null : (chatCost ?? 0) + (embeddingCost ?? 0);
    const [inventory, series, topQuestions, topFallbacks, topKnowledge, handoffReasons] = await Promise.all([
      this.database.query<Record<string, string>>(
        `SELECT
           (SELECT COUNT(*) FROM knowledge_items WHERE tenant_id=$1 AND published_version_id IS NOT NULL)::text active_knowledge,
           (SELECT COUNT(*) FROM knowledge_documents WHERE tenant_id=$1 AND processing_status NOT IN ('ready','failed','archived'))::text processing_jobs,
           (SELECT COUNT(*) FROM ai_conversations WHERE tenant_id=$1 AND started_at >= CURRENT_DATE)::text conversations_today,
           (SELECT COUNT(*) FROM handoff_tasks WHERE tenant_id=$1 AND state NOT IN ('resolved','closed'))::text handoff_backlog,
           (SELECT COUNT(*) FROM handoff_tasks WHERE tenant_id=$1 AND state NOT IN ('resolved','closed') AND due_at < NOW())::text overdue_handoffs;`, [tenantId]),
      this.database.query<{ bucket_day: Date | string; total: string; answered: string; fallback: string; handoff: string; cost_input_tokens: string; cost_output_tokens: string }>(
        `SELECT DATE_TRUNC('day', created_at) AS bucket_day, COUNT(*)::text total,
          COUNT(*) FILTER (WHERE answer_status IN ('supported','partially_supported'))::text answered,
          COUNT(*) FILTER (WHERE answer_status IN ('unsupported','safety_fallback'))::text fallback,
          COUNT(*) FILTER (WHERE handoff_required)::text handoff,
          COALESCE(SUM(input_tokens),0)::text cost_input_tokens,
          COALESCE(SUM(output_tokens),0)::text cost_output_tokens
         FROM ai_message_traces WHERE tenant_id=$1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
         GROUP BY 1 ORDER BY 1;`, [tenantId, from, to]),
      this.database.query<{ question: string; count: string }>(
        `SELECT LEFT(message.content,160) question, COUNT(*)::text count
         FROM ai_message_traces trace JOIN messages message ON message.id=trace.source_message_id
         WHERE trace.tenant_id=$1 AND trace.created_at >= $2::timestamptz AND trace.created_at < $3::timestamptz
         GROUP BY LEFT(message.content,160) ORDER BY COUNT(*) DESC, question LIMIT 10;`, [tenantId, from, to]),
      this.database.query<{ label: string; count: string }>(
        `SELECT COALESCE(fallback_reason,'unknown') label, COUNT(*)::text count
         FROM ai_message_traces WHERE tenant_id=$1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
           AND answer_status IN ('unsupported','safety_fallback') GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 10;`, [tenantId, from, to]),
      this.database.query<{ id: string; label: string; count: string }>(
        `SELECT chunk.id, COALESCE(chunk.title,chunk.metadata->>'sourceType','Knowledge') label, COUNT(*)::text count
         FROM ai_message_sources source JOIN ai_message_traces trace ON trace.id=source.ai_message_trace_id
         JOIN knowledge_chunks chunk ON chunk.id=source.knowledge_chunk_id
         WHERE trace.tenant_id=$1 AND trace.created_at >= $2::timestamptz AND trace.created_at < $3::timestamptz AND source.used_in_answer
         GROUP BY chunk.id, chunk.title, chunk.metadata->>'sourceType' ORDER BY COUNT(*) DESC LIMIT 10;`, [tenantId, from, to]),
      this.database.query<{ label: string; count: string }>(
        `SELECT COALESCE(reason,'unknown') label, COUNT(*)::text count FROM handoff_tasks
         WHERE tenant_id=$1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
         GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 10;`, [tenantId, from, to])
    ]);
    const inv = inventory.rows[0]!;
    const warnings: Array<{ code: string; severity: 'warning' | 'critical'; message: string }> = [];
    if (ratio(counts.fallback) >= settings.fallbackAlertRate && total > 0) warnings.push({ code: 'HIGH_FALLBACK', severity: 'warning', message: 'Fallback rate melewati threshold.' });
    if (Number(counts.avg_latency) >= settings.latencyAlertMs && total > 0) warnings.push({ code: 'HIGH_LATENCY', severity: 'warning', message: 'Average response latency melewati threshold.' });
    if (Number(inv.processing_jobs) >= settings.queueAlertDepth) warnings.push({ code: 'QUEUE_BACKLOG', severity: 'warning', message: 'Processing queue melewati threshold.' });
    if (Number(counts.errors) > 0) warnings.push({ code: 'PROVIDER_ERRORS', severity: 'critical', message: 'Provider error terdeteksi pada periode ini.' });
    if (Number(inv.overdue_handoffs) > 0) warnings.push({ code: 'HANDOFF_OVERDUE', severity: 'critical', message: 'Ada handoff melewati due time.' });
    const today = new Date().toISOString().slice(0, 10);
    const todayTokens = series.rows.find((row) => iso(row.bucket_day).slice(0, 10) === today);
    const todayChatCost = !todayTokens || settings.chatInputCostPerMillionUsd === null || settings.chatOutputCostPerMillionUsd === null
      ? null : (Number(todayTokens.cost_input_tokens) * settings.chatInputCostPerMillionUsd +
        Number(todayTokens.cost_output_tokens) * settings.chatOutputCostPerMillionUsd) / 1_000_000;
    if (settings.dailyBudgetUsd !== null && todayChatCost !== null && todayChatCost >= settings.dailyBudgetUsd) warnings.push({ code: 'COST_BUDGET', severity: 'critical', message: 'Estimated chat cost hari ini melewati daily budget.' });
    const point = (row: { bucket_day: Date | string; total: string; answered: string; fallback: string; handoff: string; cost_input_tokens: string; cost_output_tokens: string }) => ({
      date: iso(row.bucket_day).slice(0, 10), conversations: Number(row.total), answered: Number(row.answered),
      fallback: Number(row.fallback), handoff: Number(row.handoff),
      estimatedCostUsd: settings.chatInputCostPerMillionUsd === null || settings.chatOutputCostPerMillionUsd === null ? null :
        (Number(row.cost_input_tokens) * settings.chatInputCostPerMillionUsd + Number(row.cost_output_tokens) * settings.chatOutputCostPerMillionUsd) / 1_000_000
    });
    return {
      range: { from, to }, status: warnings.some((item) => item.severity === 'critical') ? 'degraded' : 'healthy', warnings,
      kpis: { totalQuestions: total, conversationsToday: Number(inv.conversations_today),
        answerRate: ratio(counts.answered), supportedAnswerRate: ratio(counts.supported),
        fallbackRate: ratio(counts.fallback), handoffRate: ratio(counts.handoff),
        customerInterestRate: ratio(counts.interest), unansweredRate: ratio(counts.unanswered),
        knowledgeCoverage: ratio(counts.covered), adminCorrectionRate: ratio(counts.corrected, Number(counts.reviewed ?? 0)),
        averageResponseMs: Number(counts.avg_latency), averageRetrievalMs: Number(counts.avg_retrieval_latency),
        averageProviderMs: Number(counts.avg_provider_latency), averageSimilarity: Number(counts.avg_similarity),
        activeKnowledge: Number(inv.active_knowledge), processingJobs: Number(inv.processing_jobs),
        handoffCount: Number(counts.handoff), handoffBacklog: Number(inv.handoff_backlog), unansweredCount: Number(counts.unanswered),
        cacheHitRate: ratio(counts.cache_hits), inputTokens: Number(counts.input_tokens), outputTokens: Number(counts.output_tokens) },
      cost: { instrumented: totalCost !== null, chatUsd: chatCost, embeddingUsd: embeddingCost,
        totalUsd: totalCost, budgetUsd: settings.dailyBudgetUsd,
        perAnsweredConversationUsd: totalCost === null || !answered ? null : totalCost / answered,
        embeddingTokens },
      series: series.rows.map(point),
      topQuestions: topQuestions.rows.map((row) => ({ label: row.question, count: Number(row.count) })),
      topFallbackCategories: topFallbacks.rows.map((row) => ({ label: row.label, count: Number(row.count) })),
      topKnowledge: topKnowledge.rows.map((row) => ({ id: row.id, label: row.label, count: Number(row.count) })),
      handoffReasons: handoffReasons.rows.map((row) => ({ label: row.label, count: Number(row.count) }))
    };
  }

  async getVersionChanges(tenantId: string) {
    const result = await this.database.query<{
      kind: 'prompt' | 'knowledge'; id: string; version: number; title: string;
      status: string; change_reason: string | null; published_by: string | null;
      published_at: Date | string | null; changed_fields: unknown;
    }>(`WITH prompt_changes AS (
        SELECT 'prompt'::text kind, current.id, current.version, current.name title,
          current.status, NULL::text change_reason, current.approved_by::text published_by,
          current.published_at, TO_JSONB(ARRAY_REMOVE(ARRAY[
            CASE WHEN previous.system_instruction IS DISTINCT FROM current.system_instruction THEN 'systemInstruction' END,
            CASE WHEN previous.fallback_message IS DISTINCT FROM current.fallback_message THEN 'fallbackMessage' END,
            CASE WHEN previous.handoff_message IS DISTINCT FROM current.handoff_message THEN 'handoffMessage' END,
            CASE WHEN previous.disclaimer_text IS DISTINCT FROM current.disclaimer_text THEN 'disclaimerText' END,
            CASE WHEN previous.tone IS DISTINCT FROM current.tone THEN 'tone' END
          ],NULL)) changed_fields
        FROM ai_prompt_versions current LEFT JOIN ai_prompt_versions previous
          ON previous.tenant_id=current.tenant_id AND previous.version=current.version-1
        WHERE current.tenant_id=$1
      ), knowledge_changes AS (
        SELECT 'knowledge'::text kind, current.id, current.version, current.title,
          current.status, current.change_reason, current.published_by::text,
          current.published_at, TO_JSONB(ARRAY_REMOVE(ARRAY[
            CASE WHEN previous.title IS DISTINCT FROM current.title THEN 'title' END,
            CASE WHEN previous.question IS DISTINCT FROM current.question THEN 'question' END,
            CASE WHEN previous.content IS DISTINCT FROM current.content THEN 'content' END,
            CASE WHEN previous.source_reference IS DISTINCT FROM current.source_reference THEN 'sourceReference' END,
            CASE WHEN previous.requires_disclaimer IS DISTINCT FROM current.requires_disclaimer THEN 'requiresDisclaimer' END
          ],NULL)) changed_fields
        FROM knowledge_item_versions current LEFT JOIN knowledge_item_versions previous
          ON previous.knowledge_item_id=current.knowledge_item_id AND previous.version=current.version-1
        WHERE current.tenant_id=$1
      ) SELECT * FROM (SELECT * FROM prompt_changes UNION ALL SELECT * FROM knowledge_changes) changes
        ORDER BY published_at DESC NULLS LAST, version DESC LIMIT 30;`, [tenantId]);
    return result.rows.map((row) => ({ kind: row.kind, id: row.id, version: row.version,
      title: row.title, status: row.status, reason: row.change_reason, publishedBy: row.published_by,
      publishedAt: row.published_at ? iso(row.published_at) : null, changedFields: asStrings(row.changed_fields) }));
  }

  async anonymizeConversation(tenantId: string, conversationId: string, actorId: string) {
    const result = await this.database.query<{ id: string; anonymized_at: Date | string }>(
      `WITH target AS (
         SELECT id FROM ai_conversations WHERE tenant_id=$1 AND id=$2 FOR UPDATE
       ), redacted AS (
         UPDATE messages SET content='[anonymized]', metadata=metadata - 'customerIdentifier'
         WHERE id IN (SELECT source_message_id FROM ai_message_traces WHERE tenant_id=$1 AND ai_conversation_id=$2
           UNION SELECT response_message_id FROM ai_message_traces WHERE tenant_id=$1 AND ai_conversation_id=$2)
       ) UPDATE ai_conversations SET topic=NULL, summary='[anonymized]', last_knowledge_ids='[]'::jsonb,
           anonymized_at=NOW(), anonymized_by=$3 WHERE id IN (SELECT id FROM target)
         RETURNING id, anonymized_at;`, [tenantId, conversationId, actorId]
    );
    if (!result.rows[0]) throw new AppError('AI conversation was not found', 404, 'AI_CONVERSATION_NOT_FOUND');
    return { id: result.rows[0].id, anonymizedAt: iso(result.rows[0].anonymized_at) };
  }

  async applyRetention(tenantId: string, actorId: string) {
    const settings = await this.getOperationalSettings(tenantId);
    const expired = await this.database.query<{ id: string }>(
      `SELECT id FROM ai_conversations WHERE tenant_id=$1 AND anonymized_at IS NULL
       AND last_message_at < NOW()-MAKE_INTERVAL(days=>$2) ORDER BY last_message_at LIMIT 100;`,
      [tenantId, settings.logRetentionDays]
    );
    for (const row of expired.rows) await this.anonymizeConversation(tenantId, row.id, actorId);
    await this.database.query('DELETE FROM ai_response_cache WHERE tenant_id=$1 AND expires_at<=NOW();', [tenantId]);
    return { anonymizedConversations: expired.rows.length, retentionDays: settings.logRetentionDays, batchLimit: 100 };
  }

  private async ensureReleaseReadiness(tenantId: string) {
    await this.database.query(`INSERT INTO ai_release_readiness (tenant_id) VALUES ($1)
      ON CONFLICT (tenant_id) DO NOTHING;`, [tenantId]);
  }

  async generateEvaluationReport(tenantId: string, actorId: string) {
    await this.ensureReleaseReadiness(tenantId);
    const readiness = await this.database.query<{
      minimum_dataset_size: number; target_supported_accuracy: string | number;
      target_retrieval_hit_rate: string | number; target_handoff_success_rate: string | number;
      target_system_error_rate: string | number;
    }>('SELECT * FROM ai_release_readiness WHERE tenant_id=$1;', [tenantId]);
    const cases = await this.database.query<{
      id: string; expected_category: string | null; expected_knowledge_ids: unknown;
      expected_handoff: boolean | null; passed: boolean | null; checks: unknown;
      validation_status: string | null;
    }>(`SELECT test.id, test.expected_category, test.expected_knowledge_ids,
        test.expected_handoff, run.passed, run.checks, trace.validation_status
      FROM ai_test_cases test
      LEFT JOIN LATERAL (
        SELECT * FROM ai_test_case_runs candidate WHERE candidate.test_case_id=test.id
        ORDER BY candidate.ran_at DESC LIMIT 1
      ) run ON TRUE
      LEFT JOIN ai_message_traces trace ON trace.id=run.ai_message_trace_id AND trace.tenant_id=test.tenant_id
      WHERE test.tenant_id=$1 AND test.active=TRUE;`, [tenantId]);
    const total = cases.rows.length;
    const passed = cases.rows.filter((row) => row.passed === true).length;
    const criticalCategories = new Set(['emergency', 'medical_personal', 'diagnosis_request',
      'medication_dosage', 'stop_treatment', 'prompt_injection']);
    const criticalSafetyFailures = cases.rows.filter((row) =>
      criticalCategories.has(row.expected_category ?? '') && row.passed !== true).length;
    const knowledgeCases = cases.rows.filter((row) => asStrings(row.expected_knowledge_ids).length > 0);
    const handoffCases = cases.rows.filter((row) => row.expected_handoff !== null);
    const check = (row: typeof cases.rows[number], key: string) => recordValue(row.checks)[key] === true;
    const ratio = (numerator: number, denominator: number) => denominator ? numerator / denominator : 0;
    const supportedAccuracy = ratio(passed, total);
    const retrievalHitRate = ratio(knowledgeCases.filter((row) => check(row, 'knowledge')).length, knowledgeCases.length);
    const handoffSuccessRate = ratio(handoffCases.filter((row) => check(row, 'handoff')).length, handoffCases.length);
    const systemErrorRate = ratio(cases.rows.filter((row) => row.validation_status === 'provider_error').length, total);
    const target = readiness.rows[0]!;
    const blockers: string[] = [];
    if (total < target.minimum_dataset_size) blockers.push(`Dataset ${total}/${target.minimum_dataset_size}`);
    if (supportedAccuracy < Number(target.target_supported_accuracy)) blockers.push('Supported answer accuracy below target');
    if (retrievalHitRate < Number(target.target_retrieval_hit_rate)) blockers.push('Retrieval hit rate below target');
    if (handoffSuccessRate < Number(target.target_handoff_success_rate)) blockers.push('Handoff success rate below target');
    if (systemErrorRate >= Number(target.target_system_error_rate) && total > 0) blockers.push('System error rate exceeds target');
    if (criticalSafetyFailures > 0) blockers.push('Critical safety evaluation failure exists');
    const report = await this.database.query<{ id: string; generated_at: Date | string }>(
      `INSERT INTO ai_evaluation_reports (id,tenant_id,dataset_size,passed_count,supported_accuracy,
       retrieval_hit_rate,handoff_success_rate,system_error_rate,critical_safety_failures,
       gate_passed,blockers,generated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
       RETURNING id,generated_at;`, [randomUUID(), tenantId, total, passed, supportedAccuracy,
        retrievalHitRate, handoffSuccessRate, systemErrorRate, criticalSafetyFailures,
        blockers.length === 0, JSON.stringify(blockers), actorId]
    );
    return { id: report.rows[0]!.id, datasetSize: total, passedCount: passed,
      supportedAccuracy, retrievalHitRate, handoffSuccessRate, systemErrorRate,
      criticalSafetyFailures, gatePassed: blockers.length === 0, blockers,
      generatedAt: iso(report.rows[0]!.generated_at) };
  }

  async getReleaseReadiness(tenantId: string) {
    await this.ensureReleaseReadiness(tenantId);
    const [rowResult, reportResult, inventory] = await Promise.all([
      this.database.query<{
        pilot_percentage: number; pilot_channels: unknown; pilot_note: string | null;
        minimum_dataset_size: number; target_supported_accuracy: string | number;
        target_retrieval_hit_rate: string | number; target_handoff_success_rate: string | number;
        target_system_error_rate: string | number; gates: unknown; revision: number; updated_at: Date | string;
      }>('SELECT * FROM ai_release_readiness WHERE tenant_id=$1;', [tenantId]),
      this.database.query<{
        id: string; dataset_size: number; passed_count: number; supported_accuracy: string | number;
        retrieval_hit_rate: string | number; handoff_success_rate: string | number;
        system_error_rate: string | number; critical_safety_failures: number;
        gate_passed: boolean; blockers: unknown; generated_at: Date | string;
      }>('SELECT * FROM ai_evaluation_reports WHERE tenant_id=$1 ORDER BY generated_at DESC LIMIT 1;', [tenantId]),
      this.database.query<{ published: string; missing_source: string; documents_ready: string;
        provider: string | null; secret_ref: string | null; published_prompt: string }>(
        `SELECT
          (SELECT COUNT(*) FROM knowledge_items WHERE tenant_id=$1 AND published_version_id IS NOT NULL)::text published,
          (SELECT COUNT(*) FROM knowledge_item_versions WHERE tenant_id=$1 AND status='published' AND source_reference IS NULL)::text missing_source,
          (SELECT COUNT(*) FROM knowledge_documents WHERE tenant_id=$1 AND processing_status='ready')::text documents_ready,
          (SELECT provider FROM ai_integrations WHERE tenant_id=$1 LIMIT 1) provider,
          (SELECT secret_ref FROM ai_integrations WHERE tenant_id=$1 LIMIT 1) secret_ref,
          (SELECT COUNT(*) FROM ai_prompt_versions WHERE tenant_id=$1 AND status='published')::text published_prompt;`, [tenantId])
    ]);
    const row = rowResult.rows[0]!;
    const gates = recordValue(row.gates);
    const reportRow = reportResult.rows[0];
    const report = reportRow ? { id: reportRow.id, datasetSize: reportRow.dataset_size,
      passedCount: reportRow.passed_count, supportedAccuracy: Number(reportRow.supported_accuracy),
      retrievalHitRate: Number(reportRow.retrieval_hit_rate), handoffSuccessRate: Number(reportRow.handoff_success_rate),
      systemErrorRate: Number(reportRow.system_error_rate), criticalSafetyFailures: reportRow.critical_safety_failures,
      gatePassed: reportRow.gate_passed, blockers: asStrings(reportRow.blockers), generatedAt: iso(reportRow.generated_at) } : null;
    const inv = inventory.rows[0]!;
    const blockers: Array<{ code: string; message: string }> = [];
    if (!report?.gatePassed) blockers.push({ code: 'EVALUATION_GATE', message: 'Formal 100–300 case evaluation has not passed.' });
    for (const key of releaseGateKeys) {
      if (recordValue(gates[key]).status !== 'passed') blockers.push({ code: `GATE_${key.toUpperCase()}`, message: `${key} sign-off is not recorded.` });
    }
    if (Number(inv.published) < 1 || Number(inv.missing_source) > 0) blockers.push({ code: 'KNOWLEDGE_NOT_READY', message: 'Published knowledge is empty or missing source reference.' });
    if (Number(inv.published_prompt) !== 1) blockers.push({ code: 'PROMPT_NOT_READY', message: 'Exactly one published prompt is required.' });
    if (!inv.provider || inv.provider === 'mock' || !inv.secret_ref) blockers.push({ code: 'PRODUCTION_PROVIDER_MISSING', message: 'A non-mock provider and backend secret reference are required.' });
    return { status: blockers.length ? 'blocked' as const : 'ready' as const,
      effectivePilotPercentage: 0, requestedPilotPercentage: row.pilot_percentage,
      pilotChannels: asStrings(row.pilot_channels), pilotNote: row.pilot_note,
      targets: { minimumDatasetSize: row.minimum_dataset_size,
        supportedAccuracy: Number(row.target_supported_accuracy), retrievalHitRate: Number(row.target_retrieval_hit_rate),
        handoffSuccessRate: Number(row.target_handoff_success_rate), systemErrorRate: Number(row.target_system_error_rate) },
      gates, latestEvaluation: report, blockers,
      knowledge: { published: Number(inv.published), missingSource: Number(inv.missing_source), documentsReady: Number(inv.documents_ready) },
      revision: row.revision, updatedAt: iso(row.updated_at) };
  }

  async updateReleaseGate(tenantId: string, actorId: string, key: ReleaseGateKey,
    input: { status: 'pending' | 'passed' | 'failed'; evidence: string; expectedRevision: number }) {
    await this.ensureReleaseReadiness(tenantId);
    const gate = { status: input.status, evidence: input.evidence, actorId, recordedAt: new Date().toISOString() };
    const result = await this.database.query(
      `UPDATE ai_release_readiness SET gates=JSONB_SET(gates,$3::text[],$4::jsonb,TRUE),
       revision=revision+1,updated_by=$5,updated_at=NOW() WHERE tenant_id=$1 AND revision=$2 RETURNING tenant_id;`,
      [tenantId, input.expectedRevision, [key], JSON.stringify(gate), actorId]
    );
    if (!result.rows[0]) throw new AppError('Release readiness revision conflict', 409, 'AI_RELEASE_REVISION_CONFLICT');
    return this.getReleaseReadiness(tenantId);
  }

  async updatePilotConfiguration(tenantId: string, actorId: string, input: {
    percentage: number; channels: string[]; note: string; expectedRevision: number;
  }) {
    await this.ensureReleaseReadiness(tenantId);
    const allowed = [0, 5, 10, 25, 50, 100];
    if (!allowed.includes(input.percentage)) throw new AppError('Pilot percentage is invalid', 400, 'AI_PILOT_PERCENTAGE_INVALID');
    const readiness = await this.getReleaseReadiness(tenantId);
    const nextStages: Record<number, number[]> = {
      0: [0, 5, 10],
      5: [0, 5, 10],
      10: [0, 10, 25],
      25: [0, 25, 50],
      50: [0, 50, 100],
      100: [0, 100]
    };
    if (!nextStages[readiness.requestedPilotPercentage]?.includes(input.percentage)) {
      throw new AppError('Pilot rollout must advance one stage at a time', 409, 'AI_PILOT_STEP_INVALID');
    }
    if (input.percentage > 0 && readiness.blockers.length > 0) {
      throw new AppError('Pilot configuration is blocked by release gates', 409, 'AI_PILOT_GATE_BLOCKED');
    }
    const result = await this.database.query(
      `UPDATE ai_release_readiness SET pilot_percentage=$3,pilot_channels=$4::jsonb,pilot_note=$5,
       revision=revision+1,updated_by=$6,updated_at=NOW() WHERE tenant_id=$1 AND revision=$2 RETURNING tenant_id;`,
      [tenantId, input.expectedRevision, input.percentage, JSON.stringify(input.channels), input.note, actorId]
    );
    if (!result.rows[0]) throw new AppError('Release readiness revision conflict', 409, 'AI_RELEASE_REVISION_CONFLICT');
    return this.getReleaseReadiness(tenantId);
  }

  async emergencyPausePilot(tenantId: string, actorId: string, reason: string) {
    await this.ensureReleaseReadiness(tenantId);
    await this.database.query(`UPDATE ai_release_readiness SET pilot_percentage=0,pilot_note=$2,
      revision=revision+1,updated_by=$3,updated_at=NOW() WHERE tenant_id=$1;`, [tenantId, reason, actorId]);
    await this.database.query(`UPDATE ai_integrations SET is_active=FALSE,revision=revision+1,updated_at=NOW()
      WHERE tenant_id=$1;`, [tenantId]);
    return this.getReleaseReadiness(tenantId);
  }

  async getPilotDailyReview(tenantId: string, date: string) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
    const analytics = await this.getAnalytics(tenantId, start.toISOString(), end.toISOString());
    const feedback = await this.database.query<{ unsafe: string; incorrect: string }>(
      `SELECT COUNT(*) FILTER (WHERE feedback_type='unsafe')::text unsafe,
       COUNT(*) FILTER (WHERE feedback_type IN ('incorrect','wrong_source'))::text incorrect
       FROM ai_admin_feedback WHERE tenant_id=$1 AND reviewed_at >= $2 AND reviewed_at < $3;`,
      [tenantId, start.toISOString(), end.toISOString()]
    );
    const topUnanswered = await this.database.query<{ question: string; count: number }>(
      `SELECT sample_question question,occurrence_count count FROM unanswered_questions
       WHERE tenant_id=$1 AND last_seen_at >= $2 AND last_seen_at < $3 ORDER BY occurrence_count DESC LIMIT 10;`,
      [tenantId, start.toISOString(), end.toISOString()]
    );
    return { date, analytics, unsafeFeedback: Number(feedback.rows[0]?.unsafe ?? 0),
      incorrectFeedback: Number(feedback.rows[0]?.incorrect ?? 0), topUnanswered: topUnanswered.rows };
  }
}
