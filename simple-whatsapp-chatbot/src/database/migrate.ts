import { pool } from './connection.js';
import { logger } from '../utils/logger.js';
import {
  initialChatbotRules,
  validateChatbotRules
} from '../services/chatbot-rules.js';
import { createHash } from 'node:crypto';
import { env } from '../config/env.js';

export const runMigrations = async (): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id BIGSERIAL PRIMARY KEY,
        whatsapp_jid VARCHAR UNIQUE NOT NULL,
        phone_number VARCHAR,
        display_name VARCHAR,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id BIGSERIAL PRIMARY KEY,
        whatsapp_message_id VARCHAR UNIQUE,
        contact_id BIGINT REFERENCES contacts(id),
        direction VARCHAR NOT NULL,
        message_type VARCHAR DEFAULT 'text',
        content TEXT,
        status VARCHAR DEFAULT 'received',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE contacts
        ADD COLUMN IF NOT EXISTS first_incoming_at TIMESTAMPTZ;
    `);

    await client.query(`
      UPDATE contacts AS contact
      SET first_incoming_at = first_message.created_at
      FROM (
        SELECT contact_id, MIN(created_at) AS created_at
        FROM messages
        WHERE direction = 'incoming'
        GROUP BY contact_id
      ) AS first_message
      WHERE contact.id = first_message.contact_id
        AND contact.first_incoming_at IS NULL;
    `);

    await client.query(`
      ALTER TABLE contacts
        ADD COLUMN IF NOT EXISTS pn_jid VARCHAR,
        ADD COLUMN IF NOT EXISTS lid_jid VARCHAR,
        ADD COLUMN IF NOT EXISTS canonical_jid VARCHAR,
        ADD COLUMN IF NOT EXISTS identity_status VARCHAR(20) NOT NULL DEFAULT 'unresolved';
    `);

    await client.query(`
      UPDATE contacts
      SET
        pn_jid = COALESCE(pn_jid, whatsapp_jid),
        canonical_jid = COALESCE(canonical_jid, whatsapp_jid),
        identity_status = 'resolved'
      WHERE whatsapp_jid LIKE '%@s.whatsapp.net'
        AND identity_status = 'unresolved';
    `);

    await client.query(`
      UPDATE contacts
      SET
        lid_jid = COALESCE(lid_jid, whatsapp_jid),
        identity_status = 'unresolved'
      WHERE whatsapp_jid LIKE '%@lid';
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_contact_id
      ON messages(contact_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_contact_timeline
      ON messages(contact_id, created_at DESC, id DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_updated_timeline
      ON contacts(updated_at DESC, id DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_phone
      ON contacts(phone_number);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id UUID PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        display_name VARCHAR(150) NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(30) NOT NULL,
        permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY,
        slug VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(150) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'suspended')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_tenant_memberships (
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        admin_user_id UUID NOT NULL REFERENCES admin_users(id),
        permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id, admin_user_id)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_tenant_memberships_admin
      ON admin_tenant_memberships(admin_user_id, tenant_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_integrations (
        id UUID PRIMARY KEY,
        tenant_id UUID UNIQUE NOT NULL REFERENCES tenants(id),
        name VARCHAR(150) NOT NULL,
        provider VARCHAR(50),
        chat_model VARCHAR(100),
        embedding_provider VARCHAR(50),
        embedding_model VARCHAR(100),
        embedding_dimensions INTEGER CHECK (
          embedding_dimensions IS NULL OR embedding_dimensions BETWEEN 1 AND 10000
        ),
        secret_ref TEXT,
        is_active BOOLEAN NOT NULL DEFAULT FALSE,
        strict_grounding BOOLEAN NOT NULL DEFAULT TRUE
          CHECK (strict_grounding = TRUE),
        max_response_tokens INTEGER NOT NULL DEFAULT 500
          CHECK (max_response_tokens BETWEEN 50 AND 2000),
        temperature NUMERIC(3,2) NOT NULL DEFAULT 0.10
          CHECK (temperature BETWEEN 0 AND 1),
        timeout_ms INTEGER NOT NULL DEFAULT 15000
          CHECK (timeout_ms BETWEEN 500 AND 60000),
        retry_count INTEGER NOT NULL DEFAULT 1
          CHECK (retry_count BETWEEN 0 AND 3),
        retrieval_settings JSONB NOT NULL DEFAULT '{"topK":5,"finalContextCount":3,"minimumSimilarity":null,"maximumContextTokens":null,"keywordSearchEnabled":false,"rerankerEnabled":false}'::jsonb,
        feature_flags JSONB NOT NULL DEFAULT '{"documentUpload":false,"autoHandoff":false,"analytics":false}'::jsonb,
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_prompt_versions (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        name VARCHAR(150) NOT NULL,
        system_instruction TEXT NOT NULL,
        tone VARCHAR(50) NOT NULL,
        primary_language VARCHAR(20) NOT NULL DEFAULT 'id',
        fallback_message TEXT NOT NULL,
        handoff_message TEXT NOT NULL,
        disclaimer_text TEXT,
        max_answer_length INTEGER NOT NULL
          CHECK (max_answer_length BETWEEN 50 AND 4000),
        version INTEGER NOT NULL CHECK (version > 0),
        status VARCHAR(30) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'review', 'approved', 'published', 'archived')),
        created_by UUID NOT NULL REFERENCES admin_users(id),
        approved_by UUID REFERENCES admin_users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        approved_at TIMESTAMPTZ,
        published_at TIMESTAMPTZ,
        UNIQUE (tenant_id, version)
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_prompt_one_published_per_tenant
      ON ai_prompt_versions(tenant_id)
      WHERE status = 'published';
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_tenant_timeline
      ON ai_prompt_versions(tenant_id, version DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_safety_policies (
        tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        policy JSONB NOT NULL DEFAULT '{}'::jsonb
          CHECK (jsonb_typeof(policy) = 'object'),
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
        approved_by UUID REFERENCES admin_users(id),
        approved_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS knowledge_categories (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        name VARCHAR(150) NOT NULL,
        slug VARCHAR(150) NOT NULL,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0
          CHECK (sort_order BETWEEN 0 AND 10000),
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, slug),
        UNIQUE (tenant_id, id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS knowledge_items (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        category_id UUID,
        source_type VARCHAR(30) NOT NULL
          CHECK (source_type IN ('faq', 'article')),
        current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version > 0),
        published_version_id UUID,
        created_by UUID NOT NULL REFERENCES admin_users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, id),
        FOREIGN KEY (tenant_id, category_id)
          REFERENCES knowledge_categories(tenant_id, id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS knowledge_item_versions (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        knowledge_item_id UUID NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
        title VARCHAR(255) NOT NULL,
        question TEXT,
        content TEXT NOT NULL,
        source_reference TEXT,
        internal_notes TEXT,
        tags JSONB NOT NULL DEFAULT '[]'::jsonb
          CHECK (jsonb_typeof(tags) = 'array'),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb
          CHECK (jsonb_typeof(metadata) = 'object'),
        content_fingerprint CHAR(64) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'review', 'approved', 'published', 'archived')),
        requires_disclaimer BOOLEAN NOT NULL DEFAULT FALSE,
        priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 100),
        valid_from TIMESTAMPTZ,
        valid_until TIMESTAMPTZ,
        created_by UUID NOT NULL REFERENCES admin_users(id),
        approved_by UUID REFERENCES admin_users(id),
        published_by UUID REFERENCES admin_users(id),
        change_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        approved_at TIMESTAMPTZ,
        published_at TIMESTAMPTZ,
        UNIQUE (knowledge_item_id, version),
        UNIQUE (tenant_id, id),
        FOREIGN KEY (tenant_id, knowledge_item_id)
          REFERENCES knowledge_items(tenant_id, id) ON DELETE CASCADE,
        CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS knowledge_question_variants (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        knowledge_item_version_id UUID NOT NULL,
        question TEXT NOT NULL,
        normalized_question TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (knowledge_item_version_id, normalized_question),
        FOREIGN KEY (tenant_id, knowledge_item_version_id)
          REFERENCES knowledge_item_versions(tenant_id, id) ON DELETE CASCADE
      );
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'knowledge_items_published_version_fk'
        ) THEN
          ALTER TABLE knowledge_items
            ADD CONSTRAINT knowledge_items_published_version_fk
            FOREIGN KEY (tenant_id, published_version_id)
            REFERENCES knowledge_item_versions(tenant_id, id);
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_one_published_version
      ON knowledge_item_versions(knowledge_item_id)
      WHERE status = 'published';
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_tenant_status_timeline
      ON knowledge_item_versions(tenant_id, status, updated_at DESC, id DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_items_tenant_category
      ON knowledge_items(tenant_id, category_id, updated_at DESC);
    `);

    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');

    await client.query(`
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        category_id UUID,
        original_filename VARCHAR(255) NOT NULL,
        sanitized_filename VARCHAR(255) NOT NULL,
        object_key TEXT NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_extension VARCHAR(10) NOT NULL,
        file_size BIGINT NOT NULL CHECK (file_size > 0),
        content_sha256 CHAR(64) NOT NULL,
        processing_status VARCHAR(30) NOT NULL DEFAULT 'uploaded'
          CHECK (processing_status IN (
            'uploaded', 'queued', 'extracting', 'cleaning', 'chunking',
            'embedding', 'ready', 'failed', 'archived'
          )),
        processing_revision INTEGER NOT NULL DEFAULT 0
          CHECK (processing_revision >= 0),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        extraction_preview TEXT,
        extracted_character_count INTEGER NOT NULL DEFAULT 0
          CHECK (extracted_character_count >= 0),
        page_count INTEGER,
        total_chunks INTEGER NOT NULL DEFAULT 0 CHECK (total_chunks >= 0),
        safe_error_code VARCHAR(100),
        safe_error_message VARCHAR(500),
        uploaded_by UUID NOT NULL REFERENCES admin_users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ,
        UNIQUE (tenant_id, id),
        UNIQUE (tenant_id, content_sha256),
        FOREIGN KEY (tenant_id, category_id)
          REFERENCES knowledge_categories(tenant_id, id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        knowledge_item_version_id UUID,
        document_id UUID,
        category_id UUID,
        chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
        title VARCHAR(255),
        section VARCHAR(255),
        content TEXT NOT NULL,
        content_sha256 CHAR(64) NOT NULL,
        embedding VECTOR NOT NULL,
        embedding_model VARCHAR(100) NOT NULL,
        embedding_version VARCHAR(100) NOT NULL,
        token_count INTEGER NOT NULL CHECK (token_count > 0),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb
          CHECK (jsonb_typeof(metadata) = 'object'),
        status VARCHAR(30) NOT NULL DEFAULT 'inactive'
          CHECK (status IN ('active', 'inactive', 'failed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, id),
        UNIQUE NULLS NOT DISTINCT (knowledge_item_version_id, document_id, chunk_index),
        FOREIGN KEY (tenant_id, knowledge_item_version_id)
          REFERENCES knowledge_item_versions(tenant_id, id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, document_id)
          REFERENCES knowledge_documents(tenant_id, id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, category_id)
          REFERENCES knowledge_categories(tenant_id, id),
        CHECK ((knowledge_item_version_id IS NULL) <> (document_id IS NULL))
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_embedding_usage_logs (
        id BIGSERIAL PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        knowledge_item_version_id UUID,
        document_id UUID,
        embedding_model VARCHAR(100) NOT NULL,
        embedding_version VARCHAR(100) NOT NULL,
        input_count INTEGER NOT NULL CHECK (input_count > 0),
        token_count INTEGER NOT NULL CHECK (token_count > 0),
        estimated_cost_usd NUMERIC(14,8),
        trace_id VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT ai_embedding_usage_logs_knowledge_version_fk
          FOREIGN KEY (knowledge_item_version_id)
          REFERENCES knowledge_item_versions(id) ON DELETE SET NULL,
        CONSTRAINT ai_embedding_usage_logs_document_fk
          FOREIGN KEY (document_id)
          REFERENCES knowledge_documents(id) ON DELETE SET NULL,
        CONSTRAINT ai_embedding_usage_logs_source_check
          CHECK (knowledge_item_version_id IS NULL OR document_id IS NULL)
      );
    `);

    await client.query(`
      ALTER TABLE ai_embedding_usage_logs
        DROP CONSTRAINT IF EXISTS ai_embedding_usage_logs_tenant_id_knowledge_item_version_i_fkey,
        DROP CONSTRAINT IF EXISTS ai_embedding_usage_logs_tenant_id_document_id_fkey,
        DROP CONSTRAINT IF EXISTS ai_embedding_usage_logs_check;

      ALTER TABLE ai_embedding_usage_logs
        DROP CONSTRAINT IF EXISTS ai_embedding_usage_logs_knowledge_version_fk,
        DROP CONSTRAINT IF EXISTS ai_embedding_usage_logs_document_fk,
        DROP CONSTRAINT IF EXISTS ai_embedding_usage_logs_source_check;

      ALTER TABLE ai_embedding_usage_logs
        ADD CONSTRAINT ai_embedding_usage_logs_knowledge_version_fk
          FOREIGN KEY (knowledge_item_version_id)
          REFERENCES knowledge_item_versions(id) ON DELETE SET NULL,
        ADD CONSTRAINT ai_embedding_usage_logs_document_fk
          FOREIGN KEY (document_id)
          REFERENCES knowledge_documents(id) ON DELETE SET NULL,
        ADD CONSTRAINT ai_embedding_usage_logs_source_check
          CHECK (knowledge_item_version_id IS NULL OR document_id IS NULL);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_documents_tenant_status
      ON knowledge_documents(tenant_id, processing_status, updated_at DESC, id DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tenant_active
      ON knowledge_chunks(tenant_id, status, updated_at DESC)
      WHERE status = 'active';
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document
      ON knowledge_chunks(tenant_id, document_id, chunk_index);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_conversations (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        contact_id BIGINT NOT NULL REFERENCES contacts(id),
        channel VARCHAR(50) NOT NULL CHECK (channel IN ('whatsapp', 'playground')),
        channel_session_id VARCHAR(150) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'handed_off', 'closed')),
        topic VARCHAR(100),
        is_interested BOOLEAN NOT NULL DEFAULT FALSE,
        summary TEXT,
        last_knowledge_ids JSONB NOT NULL DEFAULT '[]'::jsonb
          CHECK (jsonb_typeof(last_knowledge_ids) = 'array'),
        handoff_status VARCHAR(30),
        summary_updated_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMPTZ,
        UNIQUE (tenant_id, id)
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_conversations_active_contact_channel
      ON ai_conversations(tenant_id, contact_id, channel, channel_session_id)
      WHERE status = 'active';
    `);

    await client.query(`
      ALTER TABLE ai_conversations
        ADD COLUMN IF NOT EXISTS last_knowledge_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS handoff_status VARCHAR(30),
        ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMPTZ;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_message_traces (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        ai_conversation_id UUID NOT NULL,
        source_message_id BIGINT NOT NULL REFERENCES messages(id),
        response_message_id BIGINT REFERENCES messages(id),
        integration_id UUID NOT NULL REFERENCES ai_integrations(id),
        prompt_version_id UUID REFERENCES ai_prompt_versions(id),
        request_key VARCHAR(500) NOT NULL,
        answer_status VARCHAR(30) NOT NULL
          CHECK (answer_status IN (
            'supported', 'partially_supported', 'unsupported',
            'safety_fallback', 'admin_required'
          )),
        provider VARCHAR(50),
        model VARCHAR(100),
        best_similarity NUMERIC(8,7),
        input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
        output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
        retrieval_latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (retrieval_latency_ms >= 0),
        provider_latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (provider_latency_ms >= 0),
        total_latency_ms INTEGER NOT NULL CHECK (total_latency_ms >= 0),
        validation_status VARCHAR(30) NOT NULL
          CHECK (validation_status IN (
            'validated', 'no_context', 'provider_error', 'invalid_output'
          )),
        handoff_required BOOLEAN NOT NULL DEFAULT FALSE,
        requires_disclaimer BOOLEAN NOT NULL DEFAULT FALSE,
        customer_interest BOOLEAN NOT NULL DEFAULT FALSE,
        handoff_reason VARCHAR(100),
        safety_category VARCHAR(50) NOT NULL DEFAULT 'normal_faq',
        safety_flags JSONB NOT NULL DEFAULT '[]'::jsonb
          CHECK (jsonb_typeof(safety_flags) = 'array'),
        fallback_reason VARCHAR(100),
        output_validation_reasons JSONB NOT NULL DEFAULT '[]'::jsonb
          CHECK (jsonb_typeof(output_validation_reasons) = 'array'),
        interest_confidence NUMERIC(4,3) NOT NULL DEFAULT 0
          CHECK (interest_confidence BETWEEN 0 AND 1),
        history_message_count INTEGER NOT NULL DEFAULT 0
          CHECK (history_message_count BETWEEN 0 AND 10),
        trace_id VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, id),
        UNIQUE (tenant_id, request_key),
        UNIQUE (source_message_id),
        UNIQUE (trace_id),
        FOREIGN KEY (tenant_id, ai_conversation_id)
          REFERENCES ai_conversations(tenant_id, id)
      );
    `);

    await client.query(`
      ALTER TABLE ai_message_traces
        ADD COLUMN IF NOT EXISTS requires_disclaimer BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS customer_interest BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS handoff_reason VARCHAR(100),
        ADD COLUMN IF NOT EXISTS safety_category VARCHAR(50) NOT NULL DEFAULT 'normal_faq',
        ADD COLUMN IF NOT EXISTS safety_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS fallback_reason VARCHAR(100),
        ADD COLUMN IF NOT EXISTS output_validation_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS interest_confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS history_message_count INTEGER NOT NULL DEFAULT 0;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_message_sources (
        ai_message_trace_id UUID NOT NULL REFERENCES ai_message_traces(id) ON DELETE CASCADE,
        knowledge_chunk_id UUID NOT NULL REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
        rank INTEGER NOT NULL CHECK (rank > 0),
        similarity_score NUMERIC(8,7) NOT NULL,
        final_score NUMERIC(8,7),
        used_in_prompt BOOLEAN NOT NULL DEFAULT FALSE,
        used_in_answer BOOLEAN NOT NULL DEFAULT FALSE,
        PRIMARY KEY (ai_message_trace_id, knowledge_chunk_id)
      );
    `);

    await client.query(`
      ALTER TABLE ai_message_sources
        ADD COLUMN IF NOT EXISTS used_in_answer BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_admin_feedback (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        ai_message_trace_id UUID NOT NULL REFERENCES ai_message_traces(id) ON DELETE CASCADE,
        feedback_type VARCHAR(30) NOT NULL CHECK (feedback_type IN (
          'correct', 'incorrect', 'incomplete', 'unsafe',
          'wrong_source', 'too_long', 'too_promotional'
        )),
        comment TEXT,
        correct_knowledge_ids JSONB NOT NULL DEFAULT '[]'::jsonb
          CHECK (jsonb_typeof(correct_knowledge_ids) = 'array'),
        suggested_answer TEXT,
        reviewer_id UUID NOT NULL REFERENCES admin_users(id),
        reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, ai_message_trace_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS unanswered_questions (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        normalized_question_hash CHAR(64) NOT NULL,
        normalized_question TEXT NOT NULL,
        sample_question TEXT NOT NULL,
        occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
        best_similarity NUMERIC(8,7),
        nearest_knowledge_ids JSONB NOT NULL DEFAULT '[]'::jsonb
          CHECK (jsonb_typeof(nearest_knowledge_ids) = 'array'),
        predicted_category_id UUID,
        status VARCHAR(30) NOT NULL DEFAULT 'new'
          CHECK (status IN ('new', 'reviewing', 'knowledge_created', 'ignored', 'resolved')),
        reviewed_by UUID REFERENCES admin_users(id),
        resolved_knowledge_item_id UUID,
        review_note TEXT,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, normalized_question_hash),
        UNIQUE (tenant_id, id),
        FOREIGN KEY (tenant_id, predicted_category_id)
          REFERENCES knowledge_categories(tenant_id, id),
        FOREIGN KEY (tenant_id, resolved_knowledge_item_id)
          REFERENCES knowledge_items(tenant_id, id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS unanswered_question_occurrences (
        unanswered_question_id UUID NOT NULL,
        tenant_id UUID NOT NULL,
        ai_message_trace_id UUID NOT NULL REFERENCES ai_message_traces(id) ON DELETE CASCADE,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (unanswered_question_id, ai_message_trace_id),
        UNIQUE (tenant_id, ai_message_trace_id),
        FOREIGN KEY (tenant_id, unanswered_question_id)
          REFERENCES unanswered_questions(tenant_id, id) ON DELETE CASCADE
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_test_cases (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        name VARCHAR(160) NOT NULL,
        question TEXT NOT NULL,
        recent_context JSONB NOT NULL DEFAULT '[]'::jsonb
          CHECK (jsonb_typeof(recent_context) = 'array'),
        prompt_version_id UUID REFERENCES ai_prompt_versions(id),
        expected_category VARCHAR(50),
        expected_knowledge_ids JSONB NOT NULL DEFAULT '[]'::jsonb
          CHECK (jsonb_typeof(expected_knowledge_ids) = 'array'),
        must_contain JSONB NOT NULL DEFAULT '[]'::jsonb
          CHECK (jsonb_typeof(must_contain) = 'array'),
        must_not_contain JSONB NOT NULL DEFAULT '[]'::jsonb
          CHECK (jsonb_typeof(must_not_contain) = 'array'),
        expected_handoff BOOLEAN,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID NOT NULL REFERENCES admin_users(id),
        updated_by UUID NOT NULL REFERENCES admin_users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_test_case_runs (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        test_case_id UUID NOT NULL,
        ai_message_trace_id UUID REFERENCES ai_message_traces(id) ON DELETE SET NULL,
        passed BOOLEAN NOT NULL,
        score NUMERIC(5,4) NOT NULL CHECK (score BETWEEN 0 AND 1),
        checks JSONB NOT NULL CHECK (jsonb_typeof(checks) = 'object'),
        answer_status VARCHAR(30) NOT NULL,
        answer_preview VARCHAR(500) NOT NULL,
        trace_id VARCHAR(100) NOT NULL,
        run_by UUID NOT NULL REFERENCES admin_users(id),
        ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        FOREIGN KEY (tenant_id, test_case_id)
          REFERENCES ai_test_cases(tenant_id, id) ON DELETE CASCADE
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_message_traces_tenant_created
      ON ai_message_traces(tenant_id, created_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_message_sources_trace_rank
      ON ai_message_sources(ai_message_trace_id, rank);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_feedback_tenant_reviewed
      ON ai_admin_feedback(tenant_id, reviewed_at DESC);

      CREATE INDEX IF NOT EXISTS idx_unanswered_tenant_status_seen
      ON unanswered_questions(tenant_id, status, last_seen_at DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_unanswered_occurrence_trace
      ON unanswered_question_occurrences(tenant_id, ai_message_trace_id);

      CREATE INDEX IF NOT EXISTS idx_ai_test_cases_tenant_updated
      ON ai_test_cases(tenant_id, active, updated_at DESC, id DESC);

      CREATE INDEX IF NOT EXISTS idx_ai_test_runs_case_time
      ON ai_test_case_runs(tenant_id, test_case_id, ran_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_version
      ON knowledge_chunks(tenant_id, knowledge_item_version_id, chunk_index);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_operational_settings (
        tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        log_retention_days INTEGER NOT NULL DEFAULT 90 CHECK (log_retention_days BETWEEN 1 AND 3650),
        cache_ttl_seconds INTEGER NOT NULL DEFAULT 3600 CHECK (cache_ttl_seconds BETWEEN 60 AND 86400),
        daily_budget_usd NUMERIC(14,4) CHECK (daily_budget_usd IS NULL OR daily_budget_usd >= 0),
        chat_input_cost_per_million_usd NUMERIC(14,6) CHECK (chat_input_cost_per_million_usd IS NULL OR chat_input_cost_per_million_usd >= 0),
        chat_output_cost_per_million_usd NUMERIC(14,6) CHECK (chat_output_cost_per_million_usd IS NULL OR chat_output_cost_per_million_usd >= 0),
        embedding_cost_per_million_usd NUMERIC(14,6) CHECK (embedding_cost_per_million_usd IS NULL OR embedding_cost_per_million_usd >= 0),
        fallback_alert_rate NUMERIC(5,4) NOT NULL DEFAULT 0.30 CHECK (fallback_alert_rate BETWEEN 0 AND 1),
        latency_alert_ms INTEGER NOT NULL DEFAULT 6000 CHECK (latency_alert_ms BETWEEN 100 AND 120000),
        queue_alert_depth INTEGER NOT NULL DEFAULT 25 CHECK (queue_alert_depth BETWEEN 1 AND 100000),
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
        updated_by UUID REFERENCES admin_users(id),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ai_response_cache (
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        cache_key CHAR(64) NOT NULL,
        response_payload JSONB NOT NULL CHECK (jsonb_typeof(response_payload) = 'object'),
        knowledge_signature CHAR(64) NOT NULL,
        prompt_version_id UUID NOT NULL REFERENCES ai_prompt_versions(id) ON DELETE CASCADE,
        model VARCHAR(100) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        hit_count INTEGER NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
        last_hit_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id, cache_key)
      );

      CREATE INDEX IF NOT EXISTS idx_ai_response_cache_expiry
      ON ai_response_cache(tenant_id, expires_at);

      ALTER TABLE ai_message_traces
        ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(14,8);

      ALTER TABLE ai_conversations
        ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS anonymized_by UUID REFERENCES admin_users(id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_release_readiness (
        tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        pilot_percentage INTEGER NOT NULL DEFAULT 0 CHECK (pilot_percentage IN (0,5,10,25,50,100)),
        pilot_channels JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(pilot_channels)='array'),
        pilot_note TEXT,
        target_supported_accuracy NUMERIC(5,4) NOT NULL DEFAULT 0.90 CHECK (target_supported_accuracy BETWEEN 0 AND 1),
        target_retrieval_hit_rate NUMERIC(5,4) NOT NULL DEFAULT 0.90 CHECK (target_retrieval_hit_rate BETWEEN 0 AND 1),
        target_handoff_success_rate NUMERIC(5,4) NOT NULL DEFAULT 0.99 CHECK (target_handoff_success_rate BETWEEN 0 AND 1),
        target_system_error_rate NUMERIC(5,4) NOT NULL DEFAULT 0.01 CHECK (target_system_error_rate BETWEEN 0 AND 1),
        minimum_dataset_size INTEGER NOT NULL DEFAULT 100 CHECK (minimum_dataset_size BETWEEN 100 AND 300),
        gates JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(gates)='object'),
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision>0),
        updated_by UUID REFERENCES admin_users(id),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ai_evaluation_reports (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        dataset_size INTEGER NOT NULL CHECK (dataset_size>=0),
        passed_count INTEGER NOT NULL CHECK (passed_count>=0),
        supported_accuracy NUMERIC(6,5) NOT NULL CHECK (supported_accuracy BETWEEN 0 AND 1),
        retrieval_hit_rate NUMERIC(6,5) NOT NULL CHECK (retrieval_hit_rate BETWEEN 0 AND 1),
        handoff_success_rate NUMERIC(6,5) NOT NULL CHECK (handoff_success_rate BETWEEN 0 AND 1),
        system_error_rate NUMERIC(6,5) NOT NULL CHECK (system_error_rate BETWEEN 0 AND 1),
        critical_safety_failures INTEGER NOT NULL CHECK (critical_safety_failures>=0),
        gate_passed BOOLEAN NOT NULL,
        blockers JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(blockers)='array'),
        generated_by UUID NOT NULL REFERENCES admin_users(id),
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_ai_evaluation_reports_tenant_time
      ON ai_evaluation_reports(tenant_id, generated_at DESC);
    `);

    if (env.AI_CHATBOT_DEFAULT_TENANT_ID) {
      await client.query(
        `
          INSERT INTO tenants (id, slug, name)
          VALUES ($1, $2, $3)
          ON CONFLICT (id) DO NOTHING;
        `,
        [
          env.AI_CHATBOT_DEFAULT_TENANT_ID,
          env.AI_CHATBOT_DEFAULT_TENANT_SLUG,
          env.AI_CHATBOT_DEFAULT_TENANT_NAME
        ]
      );
      await client.query(
        `INSERT INTO ai_safety_policies (tenant_id, policy)
         VALUES ($1, '{}'::jsonb) ON CONFLICT (tenant_id) DO NOTHING;`,
        [env.AI_CHATBOT_DEFAULT_TENANT_ID]
      );
      await client.query(
        `INSERT INTO ai_operational_settings (tenant_id)
         VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING;`,
        [env.AI_CHATBOT_DEFAULT_TENANT_ID]
      );
      await client.query(
        `UPDATE admin_tenant_memberships membership SET permissions =
           CASE WHEN membership.permissions @> '["ai.logs.read"]'::jsonb THEN membership.permissions ELSE membership.permissions || '["ai.logs.read"]'::jsonb END ||
           CASE WHEN membership.permissions @> '["ai.feedback.manage"]'::jsonb THEN '[]'::jsonb ELSE '["ai.feedback.manage"]'::jsonb END ||
           CASE WHEN membership.permissions @> '["ai.unanswered.manage"]'::jsonb THEN '[]'::jsonb ELSE '["ai.unanswered.manage"]'::jsonb END ||
           CASE WHEN membership.permissions @> '["ai.evaluations.manage"]'::jsonb THEN '[]'::jsonb ELSE '["ai.evaluations.manage"]'::jsonb END ||
           CASE WHEN membership.permissions @> '["ai.analytics.read"]'::jsonb THEN '[]'::jsonb ELSE '["ai.analytics.read"]'::jsonb END ||
           CASE WHEN membership.permissions @> '["ai.operations.manage"]'::jsonb THEN '[]'::jsonb ELSE '["ai.operations.manage"]'::jsonb END ||
           CASE WHEN membership.permissions @> '["ai.privacy.manage"]'::jsonb THEN '[]'::jsonb ELSE '["ai.privacy.manage"]'::jsonb END
           || CASE WHEN membership.permissions @> '["ai.pilot.read"]'::jsonb THEN '[]'::jsonb ELSE '["ai.pilot.read"]'::jsonb END
           || CASE WHEN membership.permissions @> '["ai.release.manage"]'::jsonb THEN '[]'::jsonb ELSE '["ai.release.manage"]'::jsonb END
         FROM admin_users admin
         WHERE membership.tenant_id = $1 AND membership.admin_user_id = admin.id
           AND admin.role = 'admin';`,
        [env.AI_CHATBOT_DEFAULT_TENANT_ID]
      );
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES admin_users(id),
        token_hash CHAR(64) UNIQUE NOT NULL,
        csrf_token_hash CHAR(64) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id
      ON admin_sessions(user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at
      ON admin_sessions(expires_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGSERIAL PRIMARY KEY,
        actor_user_id UUID REFERENCES admin_users(id),
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(100) NOT NULL,
        resource_id TEXT,
        reason TEXT,
        before_state JSONB,
        after_state JSONB,
        request_id VARCHAR(100) NOT NULL,
        ip_address INET,
        user_agent TEXT,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred_at
      ON audit_logs(occurred_at DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS operational_events (
        id UUID PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_operational_events_occurred_at
      ON operational_events(occurred_at DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS handoff_tasks (
        id UUID PRIMARY KEY,
        contact_id BIGINT NOT NULL REFERENCES contacts(id),
        source_message_id BIGINT UNIQUE NOT NULL REFERENCES messages(id),
        state VARCHAR(20) NOT NULL DEFAULT 'open',
        assignee_user_id UUID REFERENCES admin_users(id),
        due_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,
        resolution_note TEXT,
        tenant_id UUID REFERENCES tenants(id),
        ai_conversation_id UUID REFERENCES ai_conversations(id),
        ai_message_trace_id UUID UNIQUE REFERENCES ai_message_traces(id),
        reason VARCHAR(50),
        priority VARCHAR(20) NOT NULL DEFAULT 'normal',
        summary TEXT,
        knowledge_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        safety_category VARCHAR(50),
        trace_id VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      ALTER TABLE handoff_tasks
        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id),
        ADD COLUMN IF NOT EXISTS ai_conversation_id UUID REFERENCES ai_conversations(id),
        ADD COLUMN IF NOT EXISTS ai_message_trace_id UUID UNIQUE REFERENCES ai_message_traces(id),
        ADD COLUMN IF NOT EXISTS reason VARCHAR(50),
        ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'normal',
        ADD COLUMN IF NOT EXISTS summary TEXT,
        ADD COLUMN IF NOT EXISTS knowledge_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS safety_category VARCHAR(50),
        ADD COLUMN IF NOT EXISTS trace_id VARCHAR(100);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_handoff_tasks_state_timeline
      ON handoff_tasks(state, created_at DESC, id DESC);
    `);

    await client.query(`
      ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS logical_id UUID,
        ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(128),
        ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'normal',
        ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS sending_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS error_code VARCHAR(100),
        ADD COLUMN IF NOT EXISTS error_message TEXT,
        ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    await client.query(`
      UPDATE messages
      SET logical_id = gen_random_uuid()
      WHERE logical_id IS NULL;
    `);

    await client.query(`
      ALTER TABLE messages
        ALTER COLUMN logical_id SET DEFAULT gen_random_uuid(),
        ALTER COLUMN logical_id SET NOT NULL;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_logical_id
      ON messages(logical_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS outbox_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id BIGINT UNIQUE NOT NULL REFERENCES messages(id),
        state VARCHAR(30) NOT NULL DEFAULT 'queued',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        lease_owner VARCHAR(150),
        lease_expires_at TIMESTAMPTZ,
        last_error_code VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_outbox_eligible
      ON outbox_messages(state, next_attempt_at, created_at);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_outbox_timeline
      ON outbox_messages(created_at DESC, id DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS message_events (
        id BIGSERIAL PRIMARY KEY,
        message_id BIGINT NOT NULL REFERENCES messages(id),
        event_type VARCHAR(50) NOT NULL,
        reason_code VARCHAR(100),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_message_events_timeline
      ON message_events(message_id, occurred_at ASC, id ASC);
    `);

    await client.query(`
      INSERT INTO message_events (message_id, event_type, occurred_at)
      SELECT messages.id, 'legacy_imported', messages.created_at
      FROM messages
      WHERE NOT EXISTS (
        SELECT 1
        FROM message_events
        WHERE message_events.message_id = messages.id
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        scope VARCHAR(100) NOT NULL,
        key_hash CHAR(64) NOT NULL,
        request_hash CHAR(64) NOT NULL,
        resource_id BIGINT REFERENCES messages(id),
        response_status INTEGER,
        response_body JSONB,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (scope, key_hash)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at
      ON idempotency_keys(expires_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chatbot_rule_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        version_number INTEGER UNIQUE NOT NULL,
        name VARCHAR(150) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        change_summary TEXT,
        based_on_version_id UUID REFERENCES chatbot_rule_versions(id),
        revision INTEGER NOT NULL DEFAULT 1,
        content_hash CHAR(64),
        created_by UUID REFERENCES admin_users(id),
        published_by UUID REFERENCES admin_users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_chatbot_one_published
      ON chatbot_rule_versions ((status))
      WHERE status = 'published';
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chatbot_versions_timeline
      ON chatbot_rule_versions(version_number DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chatbot_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        version_id UUID NOT NULL REFERENCES chatbot_rule_versions(id) ON DELETE CASCADE,
        trigger_type VARCHAR(20) NOT NULL,
        trigger_values JSONB NOT NULL DEFAULT '[]'::jsonb,
        response_text TEXT NOT NULL,
        priority INTEGER NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        action VARCHAR(30) NOT NULL DEFAULT 'reply',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (version_id, priority)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS safety_control_state (
        singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
        manual_paused BOOLEAN NOT NULL DEFAULT FALSE,
        reason TEXT,
        changed_by UUID REFERENCES admin_users(id),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      INSERT INTO safety_control_state (singleton, manual_paused)
      VALUES (TRUE, FALSE)
      ON CONFLICT (singleton) DO NOTHING;
    `);

    const seededVersion = await client.query<{ id: string }>(
      `
        INSERT INTO chatbot_rule_versions (
          version_number,
          name,
          status,
          change_summary,
          published_at
        )
        VALUES (
          1,
          'Initial migrated rules',
          'published',
          'Migrated hardcoded chatbot responses; menu 3/4 aligned to their labels.',
          NOW()
        )
        ON CONFLICT (version_number) DO NOTHING
        RETURNING id::text;
      `
    );
    const versionOne =
      seededVersion.rows[0] ??
      (
        await client.query<{ id: string }>(
          `
            SELECT id::text
            FROM chatbot_rule_versions
            WHERE version_number = 1
            LIMIT 1;
          `
        )
      ).rows[0];
    const ruleCount = await client.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM chatbot_rules
        WHERE version_id = $1::uuid;
      `,
      [versionOne.id]
    );
    if (Number(ruleCount.rows[0].count) === 0) {
      const normalizedSeed = validateChatbotRules(initialChatbotRules);
      for (const rule of normalizedSeed) {
        await client.query(
          `
            INSERT INTO chatbot_rules (
              version_id,
              trigger_type,
              trigger_values,
              response_text,
              priority,
              enabled,
              action
            )
            VALUES ($1::uuid, $2, $3::jsonb, $4, $5, $6, $7);
          `,
          [
            versionOne.id,
            rule.triggerType,
            JSON.stringify(rule.triggerValues),
            rule.responseText,
            rule.priority,
            rule.enabled,
            rule.action
          ]
        );
      }
      const contentHash = createHash('sha256')
        .update(JSON.stringify(normalizedSeed))
        .digest('hex');
      await client.query(
        `
          UPDATE chatbot_rule_versions
          SET content_hash = $2, updated_at = NOW()
          WHERE id = $1::uuid;
        `,
        [versionOne.id, contentHash]
      );
    }

    await client.query('COMMIT');
    logger.info('Database migration completed');
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'Unknown migration error';
    logger.error('Database migration failed', { error: message });
    throw error;
  } finally {
    client.release();
  }
};
