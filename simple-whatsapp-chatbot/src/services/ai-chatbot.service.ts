import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { pool } from '../database/connection.js';
import { AppError } from '../middleware/error.middleware.js';
import type { QueryExecutor } from './message.service.js';
import {
  AiDependencyProbeService,
  type AiDependencySnapshot
} from './ai-dependency-probe.service.js';
import {
  AiProviderRegistry,
  type ProviderConnectionState
} from './ai-provider.service.js';

type TransactionClient = QueryExecutor & { release(): void };
type TransactionalExecutor = QueryExecutor & {
  connect(): Promise<TransactionClient>;
};

const hasTransactions = (
  database: QueryExecutor
): database is TransactionalExecutor =>
  typeof (database as Partial<TransactionalExecutor>).connect === 'function';

type IntegrationRow = {
  id: string;
  tenant_id: string;
  name: string;
  provider: string | null;
  chat_model: string | null;
  embedding_provider: string | null;
  embedding_model: string | null;
  embedding_dimensions: number | null;
  secret_ref: string | null;
  is_active: boolean;
  strict_grounding: boolean;
  max_response_tokens: number;
  temperature: string | number;
  timeout_ms: number;
  retry_count: number;
  retrieval_settings: unknown;
  feature_flags: unknown;
  revision: number;
  updated_at: Date | string;
};

type PromptRow = {
  id: string;
  tenant_id: string;
  name: string;
  system_instruction: string;
  tone: string;
  primary_language: string;
  fallback_message: string;
  handoff_message: string;
  disclaimer_text: string | null;
  max_answer_length: number;
  version: number;
  status: AiPromptStatus;
  created_by: string;
  approved_by: string | null;
  created_at: Date | string;
  approved_at: Date | string | null;
  published_at: Date | string | null;
};

export type AiPromptStatus =
  | 'draft'
  | 'review'
  | 'approved'
  | 'published'
  | 'archived';

export type RetrievalSettings = {
  topK: number;
  finalContextCount: number;
  minimumSimilarity: number | null;
  maximumContextTokens: number | null;
  keywordSearchEnabled: boolean;
  rerankerEnabled: boolean;
};

export type AiFeatureFlags = {
  documentUpload: boolean;
  autoHandoff: boolean;
  analytics: boolean;
};

export type AiIntegration = {
  id: string;
  tenantId: string;
  name: string;
  provider: string | null;
  chatModel: string | null;
  embeddingProvider: string | null;
  embeddingModel: string | null;
  embeddingDimensions: number | null;
  secretReferenceConfigured: boolean;
  active: boolean;
  effectiveEnabled: false;
  strictGrounding: true;
  maxResponseTokens: number;
  temperature: number;
  timeoutMs: number;
  retryCount: number;
  retrieval: RetrievalSettings;
  featureFlags: AiFeatureFlags;
  revision: number;
  updatedAt: string;
};

export type AiPrompt = {
  id: string;
  tenantId: string;
  name: string;
  version: number;
  status: AiPromptStatus;
  primaryLanguage: string;
  tone: string;
  systemInstruction: string;
  fallbackMessage: string;
  handoffMessage: string;
  disclaimerText: string | null;
  maxAnswerLength: number;
  createdBy: string;
  approvedBy: string | null;
  createdAt: string;
  approvedAt: string | null;
  publishedAt: string | null;
};

export type AiReadiness = {
  effectiveEnabled: false;
  blockers: Array<{ code: string; message: string }>;
  dependencies: AiDependencySnapshot;
  publishedPromptConfigured: boolean;
};

export type UpdateAiIntegrationInput = {
  expectedRevision: number;
  name: string;
  provider: string;
  chatModel: string;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number | null;
  secretReference?: string | null;
  strictGrounding: true;
  maxResponseTokens: number;
  temperature: number;
  timeoutMs: number;
  retryCount: number;
  retrieval: RetrievalSettings;
  featureFlags: AiFeatureFlags;
};

export type CreateAiPromptInput = {
  name: string;
  primaryLanguage: string;
  tone: string;
  systemInstruction: string;
  fallbackMessage: string;
  handoffMessage: string;
  disclaimerText: string | null;
  maxAnswerLength: number;
};

const defaultRetrievalSettings: RetrievalSettings = {
  topK: 5,
  finalContextCount: 3,
  minimumSimilarity: null,
  maximumContextTokens: null,
  keywordSearchEnabled: false,
  rerankerEnabled: false
};

const defaultFeatureFlags: AiFeatureFlags = {
  documentUpload: false,
  autoHandoff: false,
  analytics: false
};

const parseObject = <T>(value: unknown, fallback: T): T => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  return value as T;
};

const iso = (value: Date | string): string => new Date(value).toISOString();
const nullableIso = (value: Date | string | null): string | null =>
  value ? iso(value) : null;

const toIntegration = (row: IntegrationRow): AiIntegration => ({
  id: row.id,
  tenantId: row.tenant_id,
  name: row.name,
  provider: row.provider,
  chatModel: row.chat_model,
  embeddingProvider: row.embedding_provider,
  embeddingModel: row.embedding_model,
  embeddingDimensions: row.embedding_dimensions,
  secretReferenceConfigured: Boolean(row.secret_ref),
  active: row.is_active,
  effectiveEnabled: false,
  strictGrounding: true,
  maxResponseTokens: row.max_response_tokens,
  temperature: Number(row.temperature),
  timeoutMs: row.timeout_ms,
  retryCount: row.retry_count,
  retrieval: {
    ...defaultRetrievalSettings,
    ...parseObject<Partial<RetrievalSettings>>(row.retrieval_settings, {})
  },
  featureFlags: {
    ...defaultFeatureFlags,
    ...parseObject<Partial<AiFeatureFlags>>(row.feature_flags, {})
  },
  revision: row.revision,
  updatedAt: iso(row.updated_at)
});

const toPrompt = (row: PromptRow): AiPrompt => ({
  id: row.id,
  tenantId: row.tenant_id,
  name: row.name,
  version: row.version,
  status: row.status,
  primaryLanguage: row.primary_language,
  tone: row.tone,
  systemInstruction: row.system_instruction,
  fallbackMessage: row.fallback_message,
  handoffMessage: row.handoff_message,
  disclaimerText: row.disclaimer_text,
  maxAnswerLength: row.max_answer_length,
  createdBy: row.created_by,
  approvedBy: row.approved_by,
  createdAt: iso(row.created_at),
  approvedAt: nullableIso(row.approved_at),
  publishedAt: nullableIso(row.published_at)
});

export class AiChatbotService {
  constructor(
    private readonly database: QueryExecutor = pool,
    private readonly providers = new AiProviderRegistry(),
    private readonly probes = new AiDependencyProbeService(database, providers)
  ) {}

  private async transaction<T>(
    callback: (database: QueryExecutor) => Promise<T>
  ): Promise<T> {
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

  async ensureDefaultIntegration(tenantId: string): Promise<void> {
    await this.database.query(
      `
        INSERT INTO ai_integrations (
          id,
          tenant_id,
          name,
          provider,
          chat_model,
          embedding_provider,
          embedding_model,
          secret_ref,
          strict_grounding
        )
        VALUES ($1, $2, 'RAHO AI Integration', $3, $4, $3, $5, $6, TRUE)
        ON CONFLICT (tenant_id) DO NOTHING;
      `,
      [
        randomUUID(),
        tenantId,
        env.AI_CHATBOT_PROVIDER,
        env.AI_CHATBOT_CHAT_MODEL,
        env.AI_CHATBOT_EMBEDDING_MODEL,
        env.AI_CHATBOT_PROVIDER_SECRET_REF
      ]
    );
  }

  private async integrationRow(
    tenantId: string,
    database: QueryExecutor = this.database
  ): Promise<IntegrationRow> {
    const result = await database.query<IntegrationRow>(
      'SELECT * FROM ai_integrations WHERE tenant_id = $1::uuid LIMIT 1;',
      [tenantId]
    );
    if (!result.rows[0]) {
      throw new AppError(
        'AI integration settings have not been bootstrapped for this tenant',
        404,
        'AI_INTEGRATION_NOT_FOUND'
      );
    }
    return result.rows[0];
  }

  async getIntegration(tenantId: string): Promise<AiIntegration> {
    return toIntegration(await this.integrationRow(tenantId));
  }

  async updateIntegration(
    tenantId: string,
    input: UpdateAiIntegrationInput
  ): Promise<{ before: AiIntegration; after: AiIntegration }> {
    const before = toIntegration(await this.integrationRow(tenantId));
    const changesSecret = Object.prototype.hasOwnProperty.call(
      input,
      'secretReference'
    );
    const result = await this.database.query<IntegrationRow>(
      `
        UPDATE ai_integrations
        SET
          name = $3,
          provider = $4,
          chat_model = $5,
          embedding_provider = $6,
          embedding_model = $7,
          embedding_dimensions = $8,
          secret_ref = CASE WHEN $9::boolean THEN $10 ELSE secret_ref END,
          strict_grounding = TRUE,
          max_response_tokens = $11,
          temperature = $12,
          timeout_ms = $13,
          retry_count = $14,
          retrieval_settings = $15::jsonb,
          feature_flags = $16::jsonb,
          revision = revision + 1,
          updated_at = NOW()
        WHERE tenant_id = $1::uuid
          AND revision = $2
          AND is_active = FALSE
        RETURNING *;
      `,
      [
        tenantId,
        input.expectedRevision,
        input.name,
        input.provider,
        input.chatModel,
        input.embeddingProvider,
        input.embeddingModel,
        input.embeddingDimensions,
        changesSecret,
        input.secretReference ?? null,
        input.maxResponseTokens,
        input.temperature,
        input.timeoutMs,
        input.retryCount,
        JSON.stringify(input.retrieval),
        JSON.stringify(input.featureFlags)
      ]
    );
    if (!result.rows[0]) {
      throw new AppError(
        'AI integration revision is stale or the integration is active',
        409,
        'AI_INTEGRATION_REVISION_CONFLICT',
        { expectedRevision: input.expectedRevision, actualRevision: before.revision }
      );
    }
    return { before, after: toIntegration(result.rows[0]) };
  }

  async testConnection(tenantId: string): Promise<{
    chatProvider: ProviderConnectionState;
    embeddingProvider: ProviderConnectionState;
    testedAt: string;
  }> {
    const integration = await this.integrationRow(tenantId);
    const chat = this.providers.getChatProvider(integration.provider);
    const embedding = this.providers.getEmbeddingProvider(
      integration.embedding_provider
    );
    const [chatProvider, embeddingProvider] = await Promise.all([
      chat && integration.chat_model
        ? chat.testConnection(integration.chat_model, {
            secretReference: integration.secret_ref,
            timeoutMs: integration.timeout_ms
          })
        : Promise.resolve<ProviderConnectionState>('invalid_configuration'),
      embedding && integration.embedding_model
        ? embedding.testConnection(integration.embedding_model, {
            secretReference: integration.secret_ref,
            timeoutMs: integration.timeout_ms
          })
        : Promise.resolve<ProviderConnectionState>('invalid_configuration')
    ]);
    return {
      chatProvider,
      embeddingProvider,
      testedAt: new Date().toISOString()
    };
  }

  async getReadiness(tenantId: string): Promise<AiReadiness> {
    const integration = await this.integrationRow(tenantId);
    const dependencies = await this.probes.probe({
      provider: integration.provider,
      chatModel: integration.chat_model,
      embeddingProvider: integration.embedding_provider,
      embeddingModel: integration.embedding_model,
      secretReference: integration.secret_ref,
      timeoutMs: integration.timeout_ms
    });
    const promptResult = await this.database.query<{ configured: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1 FROM ai_prompt_versions
          WHERE tenant_id = $1::uuid AND status = 'published'
        ) AS configured;
      `,
      [tenantId]
    );
    const publishedPromptConfigured = Boolean(promptResult.rows[0]?.configured);
    const blockers: AiReadiness['blockers'] = [
      {
        code: 'GLOBAL_RUNTIME_HARD_OFF',
        message: 'Customer AI traffic is intentionally unavailable before safety, evaluation, and release gates are approved.'
      }
    ];
    if (!integration.is_active) {
      blockers.push({
        code: 'TENANT_INTEGRATION_INACTIVE',
        message: 'The tenant integration has not been activated.'
      });
    }
    if (
      !integration.provider ||
      !integration.chat_model ||
      !integration.embedding_provider ||
      !integration.embedding_model ||
      !integration.embedding_dimensions ||
      !integration.secret_ref
    ) {
      blockers.push({
        code: 'PROVIDER_CONFIGURATION_INCOMPLETE',
        message: 'Provider, models, dimensions, and secret reference must be configured.'
      });
    }
    if (!publishedPromptConfigured) {
      blockers.push({
        code: 'PUBLISHED_PROMPT_MISSING',
        message: 'An approved and published AI instruction is required.'
      });
    }
    for (const [dependency, state] of Object.entries(dependencies)) {
      if (dependency === 'checkedAt' || state === 'reachable') continue;
      blockers.push({
        code: `DEPENDENCY_${dependency.toUpperCase()}_${String(state).toUpperCase()}`,
        message: `${dependency} is ${state}.`
      });
    }
    return {
      effectiveEnabled: false,
      blockers,
      dependencies,
      publishedPromptConfigured
    };
  }

  async activate(tenantId: string, expectedRevision: number): Promise<never> {
    const integration = await this.getIntegration(tenantId);
    if (integration.revision !== expectedRevision) {
      throw new AppError(
        'AI integration revision is stale',
        409,
        'AI_INTEGRATION_REVISION_CONFLICT',
        { expectedRevision, actualRevision: integration.revision }
      );
    }
    const readiness = await this.getReadiness(tenantId);
    throw new AppError(
      'AI activation remains blocked until safety, evaluation, and customer release gates are approved',
      409,
      'AI_ACTIVATION_BLOCKED',
      { blockers: readiness.blockers }
    );
  }

  async deactivate(
    tenantId: string,
    expectedRevision: number
  ): Promise<{ before: AiIntegration; after: AiIntegration }> {
    const before = await this.getIntegration(tenantId);
    const result = await this.database.query<IntegrationRow>(
      `
        UPDATE ai_integrations
        SET is_active = FALSE, revision = revision + 1, updated_at = NOW()
        WHERE tenant_id = $1::uuid AND revision = $2
        RETURNING *;
      `,
      [tenantId, expectedRevision]
    );
    if (!result.rows[0]) {
      throw new AppError(
        'AI integration revision is stale',
        409,
        'AI_INTEGRATION_REVISION_CONFLICT',
        { expectedRevision, actualRevision: before.revision }
      );
    }
    return { before, after: toIntegration(result.rows[0]) };
  }

  async listPrompts(
    tenantId: string,
    input: { limit: number; beforeVersion: number | null }
  ): Promise<{ data: AiPrompt[]; nextCursor: string | null }> {
    const result = await this.database.query<PromptRow>(
      `
        SELECT * FROM ai_prompt_versions
        WHERE tenant_id = $1::uuid
          AND ($2::integer IS NULL OR version < $2)
        ORDER BY version DESC
        LIMIT $3;
      `,
      [tenantId, input.beforeVersion, input.limit + 1]
    );
    const hasNext = result.rows.length > input.limit;
    const rows = result.rows.slice(0, input.limit);
    return {
      data: rows.map(toPrompt),
      nextCursor: hasNext ? String(rows.at(-1)!.version) : null
    };
  }

  async createPrompt(
    tenantId: string,
    actorUserId: string,
    input: CreateAiPromptInput
  ): Promise<AiPrompt> {
    return this.transaction(async (database) => {
      await database.query(
        'SELECT id FROM tenants WHERE id = $1::uuid FOR UPDATE;',
        [tenantId]
      );
      const versionResult = await database.query<{ version: number }>(
        `
          SELECT COALESCE(MAX(version), 0)::integer + 1 AS version
          FROM ai_prompt_versions WHERE tenant_id = $1::uuid;
        `,
        [tenantId]
      );
      const result = await database.query<PromptRow>(
        `
          INSERT INTO ai_prompt_versions (
            id, tenant_id, name, system_instruction, tone, primary_language,
            fallback_message, handoff_message, disclaimer_text,
            max_answer_length, version, status, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft', $12)
          RETURNING *;
        `,
        [
          randomUUID(),
          tenantId,
          input.name,
          input.systemInstruction,
          input.tone,
          input.primaryLanguage,
          input.fallbackMessage,
          input.handoffMessage,
          input.disclaimerText,
          input.maxAnswerLength,
          versionResult.rows[0]?.version ?? 1,
          actorUserId
        ]
      );
      return toPrompt(result.rows[0]!);
    });
  }

  async approvePrompt(
    tenantId: string,
    promptId: string,
    actorUserId: string,
    expectedVersion: number
  ): Promise<AiPrompt> {
    const result = await this.database.query<PromptRow>(
      `
        UPDATE ai_prompt_versions
        SET status = 'approved', approved_by = $3, approved_at = NOW()
        WHERE id = $1::uuid
          AND tenant_id = $2::uuid
          AND version = $4
          AND status IN ('draft', 'review')
        RETURNING *;
      `,
      [promptId, tenantId, actorUserId, expectedVersion]
    );
    if (!result.rows[0]) {
      throw new AppError(
        'Prompt was not found in an approvable state for this tenant',
        409,
        'AI_PROMPT_APPROVAL_CONFLICT'
      );
    }
    return toPrompt(result.rows[0]);
  }

  async publishPrompt(
    tenantId: string,
    promptId: string,
    expectedVersion: number
  ): Promise<AiPrompt> {
    return this.transaction(async (database) => {
      await database.query(
        'SELECT id FROM tenants WHERE id = $1::uuid FOR UPDATE;',
        [tenantId]
      );
      const target = await database.query<PromptRow>(
        `
          SELECT * FROM ai_prompt_versions
          WHERE id = $1::uuid AND tenant_id = $2::uuid
          FOR UPDATE;
        `,
        [promptId, tenantId]
      );
      const row = target.rows[0];
      if (!row) {
        throw new AppError('Prompt not found', 404, 'AI_PROMPT_NOT_FOUND');
      }
      if (row.version !== expectedVersion || row.status !== 'approved') {
        throw new AppError(
          'Only the expected approved prompt version can be published',
          409,
          'AI_PROMPT_PUBLISH_CONFLICT',
          { expectedVersion, actualVersion: row.version, status: row.status }
        );
      }
      await database.query(
        `
          UPDATE ai_prompt_versions
          SET status = 'archived'
          WHERE tenant_id = $1::uuid AND status = 'published';
        `,
        [tenantId]
      );
      const published = await database.query<PromptRow>(
        `
          UPDATE ai_prompt_versions
          SET status = 'published', published_at = NOW()
          WHERE id = $1::uuid AND tenant_id = $2::uuid
          RETURNING *;
        `,
        [promptId, tenantId]
      );
      return toPrompt(published.rows[0]!);
    });
  }
}
