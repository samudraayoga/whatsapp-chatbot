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
};

const conversationFromRow = (row: ConversationRow) => ({
  id: row.id,
  contactId: row.contact_id,
  customer: {
    displayName: row.display_name,
    maskedIdentifier: row.phone_number ? maskPhoneNumber(row.phone_number) : 'Playground'
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
    conversation.closed_at, contact.display_name, contact.phone_number,
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
    }>(
      `SELECT trace.id, trace.source_message_id::text, trace.response_message_id::text,
        source.content AS customer_message, response.content AS assistant_message,
        trace.answer_status, trace.validation_status, trace.fallback_reason,
        trace.safety_category, trace.handoff_required, trace.requires_disclaimer,
        trace.model, trace.prompt_version_id, trace.input_tokens, trace.output_tokens,
        trace.retrieval_latency_ms, trace.provider_latency_ms, trace.total_latency_ms,
        trace.trace_id, trace.created_at,
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
        traceId: row.trace_id, sources: Array.isArray(row.sources) ? row.sources : [],
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
}
