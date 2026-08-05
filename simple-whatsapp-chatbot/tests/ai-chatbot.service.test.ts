import type { QueryResult, QueryResultRow } from 'pg';
import type { AiDependencyProbeService } from '../src/services/ai-dependency-probe.service.js';
import type { AiProviderRegistry } from '../src/services/ai-provider.service.js';
import { AiChatbotService } from '../src/services/ai-chatbot.service.js';
import type { QueryExecutor } from '../src/services/message.service.js';

const queryResult = <Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> => ({
  command: 'SELECT',
  rowCount: rows.length,
  oid: 0,
  fields: [],
  rows
});

const tenantId = '00000000-0000-4000-8000-000000000001';
const integrationRow = {
  id: '37b38a20-371f-4e9a-9d4a-b8df5f546acd',
  tenant_id: tenantId,
  name: 'RAHO AI',
  provider: 'mock',
  chat_model: 'mock-chat-v1',
  embedding_provider: 'mock',
  embedding_model: 'mock-embed-v1',
  embedding_dimensions: 8,
  secret_ref: 'env://AI_CHATBOT_MOCK_KEY',
  is_active: false,
  strict_grounding: true,
  max_response_tokens: 500,
  temperature: '0.10',
  timeout_ms: 15000,
  retry_count: 1,
  retrieval_settings: {
    topK: 5,
    finalContextCount: 3,
    minimumSimilarity: null,
    maximumContextTokens: null,
    keywordSearchEnabled: false,
    rerankerEnabled: false
  },
  feature_flags: {
    documentUpload: false,
    autoHandoff: false,
    analytics: false
  },
  revision: 1,
  updated_at: new Date('2026-08-05T01:00:00.000Z')
};

const promptRow = {
  id: '2502fb9f-7007-457b-a318-a3a1a64e8bc4',
  tenant_id: tenantId,
  name: 'FAQ Indonesia',
  system_instruction: 'Jawab hanya berdasarkan knowledge resmi yang diberikan kepada model.',
  tone: 'hangat',
  primary_language: 'id',
  fallback_message: 'Informasi belum tersedia di Knowledge Base RAHO.',
  handoff_message: 'Pertanyaan akan diteruskan kepada Admin RAHO.',
  disclaimer_text: null,
  max_answer_length: 800,
  version: 2,
  status: 'approved' as const,
  created_by: '2a99543d-80d5-47a0-92ef-a389ce1a3001',
  approved_by: '2a99543d-80d5-47a0-92ef-a389ce1a3001',
  created_at: new Date('2026-08-05T01:00:00.000Z'),
  approved_at: new Date('2026-08-05T02:00:00.000Z'),
  published_at: null
};

describe('AiChatbotService', () => {
  it('returns redacted settings and never serializes the secret reference', async () => {
    const database = {
      query: vi.fn(async () => queryResult([integrationRow]))
    } as unknown as QueryExecutor;

    const result = await new AiChatbotService(database).getIntegration(tenantId);

    expect(result.secretReferenceConfigured).toBe(true);
    expect(result.effectiveEnabled).toBe(false);
    expect(JSON.stringify(result)).not.toContain('AI_CHATBOT_MOCK_KEY');
  });

  it('uses tenant and revision predicates and preserves a secret when omitted', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce(queryResult([integrationRow]))
        .mockResolvedValueOnce(
          queryResult([{ ...integrationRow, revision: 2 }])
        )
    } as unknown as QueryExecutor;
    const service = new AiChatbotService(database);

    const result = await service.updateIntegration(tenantId, {
      expectedRevision: 1,
      name: 'RAHO AI',
      provider: 'mock',
      chatModel: 'mock-chat-v1',
      embeddingProvider: 'mock',
      embeddingModel: 'mock-embed-v1',
      embeddingDimensions: 8,
      strictGrounding: true,
      maxResponseTokens: 500,
      temperature: 0.1,
      timeoutMs: 15000,
      retryCount: 1,
      retrieval: integrationRow.retrieval_settings,
      featureFlags: integrationRow.feature_flags
    });

    const updateCall = vi.mocked(database.query).mock.calls[1]!;
    expect(updateCall[0]).toContain('WHERE tenant_id = $1::uuid');
    expect(updateCall[1]?.[0]).toBe(tenantId);
    expect(updateCall[1]?.[1]).toBe(1);
    expect(updateCall[1]?.[8]).toBe(false);
    expect(result.after.revision).toBe(2);
  });

  it('keeps activation fail-closed and returns concrete blockers', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce(queryResult([integrationRow]))
        .mockResolvedValueOnce(queryResult([integrationRow]))
        .mockResolvedValueOnce(queryResult([{ configured: false }]))
    } as unknown as QueryExecutor;
    const probes = {
      probe: vi.fn(async () => ({
        vectorStore: 'reachable',
        queue: 'reachable',
        objectStorage: 'reachable',
        chatProvider: 'reachable',
        embeddingProvider: 'reachable',
        checkedAt: '2026-08-05T03:00:00.000Z'
      }))
    } as unknown as AiDependencyProbeService;
    const service = new AiChatbotService(
      database,
      undefined as unknown as AiProviderRegistry,
      probes
    );

    await expect(service.activate(tenantId, 1)).rejects.toMatchObject({
      code: 'AI_ACTIVATION_BLOCKED',
      statusCode: 409,
      details: {
        blockers: expect.arrayContaining([
          expect.objectContaining({ code: 'GLOBAL_RUNTIME_HARD_OFF' }),
          expect.objectContaining({ code: 'PUBLISHED_PROMPT_MISSING' })
        ])
      }
    });
  });

  it('publishes only an approved prompt inside a tenant-scoped transaction', async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return queryResult([]);
        }
        if (sql.includes('SELECT * FROM ai_prompt_versions')) {
          return queryResult([promptRow]);
        }
        if (sql.includes("SET status = 'published'")) {
          return queryResult([
            {
              ...promptRow,
              status: 'published' as const,
              published_at: new Date('2026-08-05T03:00:00.000Z')
            }
          ]);
        }
        return queryResult([]);
      }),
      release: vi.fn()
    };
    const database = {
      query: vi.fn(),
      connect: vi.fn(async () => client)
    } as unknown as QueryExecutor;

    const result = await new AiChatbotService(database).publishPrompt(
      tenantId,
      promptRow.id,
      2
    );

    expect(result.status).toBe('published');
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
    expect(
      client.query.mock.calls.some(([sql]) =>
        String(sql).includes("WHERE tenant_id = $1::uuid AND status = 'published'")
      )
    ).toBe(true);
  });
});
