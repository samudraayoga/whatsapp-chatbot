import { describe, expect, it } from 'vitest';
import {
  aiChatbotFoundationResponseSchema,
  aiIntegrationResponseSchema,
  aiRagResultResponseSchema,
  knowledgeCategoryListResponseSchema,
  knowledgeDocumentListResponseSchema,
  knowledgeListResponseSchema,
  chatbotConfigResponseSchema,
  chatbotTestResponseSchema,
  overviewResponseSchema
} from './contracts';
import {
  databaseDownOverview,
  healthyOverview,
  highRiskOverview,
  qrRequiredOverview
} from '../mocks/fixtures';
import {
  mockChatbotConfig,
  mockChatbotMeta
} from '../mocks/chatbot-fixtures';
import {
  mockAiChatbotFoundation,
  mockAiIntegration,
  mockAiRagResult,
  mockKnowledge,
  mockKnowledgeCategories,
  mockKnowledgeDocuments
} from '../mocks/ai-chatbot-fixtures';

describe('overviewResponseSchema', () => {
  it.each([
    ['healthy', healthyOverview],
    ['qr required', qrRequiredOverview],
    ['high risk', highRiskOverview],
    ['database down', databaseDownOverview]
  ])('accepts the %s contract fixture', (_name, fixture) => {
    expect(overviewResponseSchema.parse(fixture)).toEqual(fixture);
  });

  it('rejects warm-up progress outside normalized 0-1 range', () => {
    expect(() =>
      overviewResponseSchema.parse({
        ...healthyOverview,
        data: {
          ...healthyOverview.data,
          warmup: {
            ...healthyOverview.data.warmup!,
            progressRatio: 50
          }
        }
      })
    ).toThrow();
  });
});

describe('chatbot configuration contracts', () => {
  it('accepts the single active configuration response', () => {
    const payload = {
      data: mockChatbotConfig,
      meta: mockChatbotMeta()
    };

    expect(chatbotConfigResponseSchema.parse(payload)).toEqual(payload);
  });

  it('accepts preview results without version metadata', () => {
    const payload = {
      data: {
        normalizedInput: 'menu',
        matchedRule: {
          triggerType: 'alias' as const,
          priority: 100,
          matchedTrigger: 'menu',
          action: 'reply' as const
        },
        response: 'Menu utama'
      },
      meta: mockChatbotMeta()
    };

    expect(chatbotTestResponseSchema.parse(payload)).toEqual(payload);
  });
});

describe('AI chatbot foundation contract', () => {
  it('accepts the fail-closed Sprint 5 fixture', () => {
    expect(
      aiChatbotFoundationResponseSchema.parse(mockAiChatbotFoundation)
    ).toEqual(mockAiChatbotFoundation);
  });

  it('accepts a contract with controlled customer traffic enabled', () => {
    expect(
      aiChatbotFoundationResponseSchema.parse({
        ...mockAiChatbotFoundation,
        data: {
          ...mockAiChatbotFoundation.data,
          runtime: {
            ...mockAiChatbotFoundation.data.runtime,
            enabled: true,
            customerTraffic: 'enabled'
          }
        }
      }).data.runtime.customerTraffic
    ).toBe('enabled');
  });

  it('rejects duplicate modules and a mismatched module path', () => {
    const modules = structuredClone(mockAiChatbotFoundation.data.modules);
    modules[1] = {
      ...modules[0],
      path: '/ai-chatbot/knowledge'
    };

    expect(() =>
      aiChatbotFoundationResponseSchema.parse({
        ...mockAiChatbotFoundation,
        data: { ...mockAiChatbotFoundation.data, modules }
      })
    ).toThrow();
  });

  it('rejects development-ready status without strict grounding', () => {
    expect(() =>
      aiChatbotFoundationResponseSchema.parse({
        ...mockAiChatbotFoundation,
        data: {
          ...mockAiChatbotFoundation.data,
          runtime: {
            ...mockAiChatbotFoundation.data.runtime,
            strictGrounding: false
          }
        }
      })
    ).toThrow();
  });

  it('requires the Sprint 2 modules to report their implemented state', () => {
    const modules = structuredClone(mockAiChatbotFoundation.data.modules);
    modules.find((module) => module.key === 'knowledge')!.state = 'planned';
    expect(() =>
      aiChatbotFoundationResponseSchema.parse({
        ...mockAiChatbotFoundation,
        data: { ...mockAiChatbotFoundation.data, modules }
      })
    ).toThrow();
  });
});

describe('Sprint 4 Alpha RAG contract', () => {
  it('accepts structured answer, source, token, latency, and trace metadata', () => {
    expect(aiRagResultResponseSchema.parse(mockAiRagResult)).toEqual(mockAiRagResult);
  });

  it('rejects an unknown validation state', () => {
    const response = structuredClone(mockAiRagResult) as unknown as { data: Record<string, unknown> };
    response.data.validationStatus = 'trusted_anyway';
    expect(() => aiRagResultResponseSchema.parse(response)).toThrow();
  });
});

describe('Sprint 2 knowledge contracts', () => {
  it('accepts tenant-scoped categories and versioned knowledge', () => {
    expect(knowledgeCategoryListResponseSchema.parse(mockKnowledgeCategories)).toEqual(mockKnowledgeCategories);
    expect(knowledgeListResponseSchema.parse(mockKnowledge)).toEqual(mockKnowledge);
  });

  it('rejects a malformed knowledge fingerprint', () => {
    const response = structuredClone(mockKnowledge);
    response.data[0]!.contentFingerprint = 'not-a-sha256';
    expect(() => knowledgeListResponseSchema.parse(response)).toThrow();
  });
});

describe('Sprint 3 document contracts', () => {
  it('accepts document processing state and tenant-scoped metadata', () => {
    expect(knowledgeDocumentListResponseSchema.parse(mockKnowledgeDocuments)).toEqual(mockKnowledgeDocuments);
  });

  it('rejects an unsupported document extension', () => {
    const response = structuredClone(mockKnowledgeDocuments) as unknown as { data: Array<Record<string, unknown>> };
    response.data[0]!.extension = 'exe';
    expect(() => knowledgeDocumentListResponseSchema.parse(response)).toThrow();
  });
});

describe('AI integration contract', () => {
  it('accepts redacted settings and explicit readiness blockers', () => {
    expect(aiIntegrationResponseSchema.parse(mockAiIntegration)).toEqual(
      mockAiIntegration
    );
    expect(JSON.stringify(mockAiIntegration)).not.toContain('secretReference:');
  });

  it('accepts an effectively enabled customer integration', () => {
    expect(
      aiIntegrationResponseSchema.parse({
        ...mockAiIntegration,
        data: {
          ...mockAiIntegration.data,
          integration: {
            ...mockAiIntegration.data.integration,
            effectiveEnabled: true
          }
        }
      }).data.integration.effectiveEnabled
    ).toBe(true);
  });
});
