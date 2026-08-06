import {
  parseIntegrationUpdate,
  parsePromptCreate
} from '../src/services/ai-chatbot-validation.js';

const integrationInput = {
  expectedRevision: 1,
  name: 'RAHO AI',
  provider: 'mock',
  chatModel: 'mock-chat-v1',
  embeddingProvider: 'mock',
  embeddingModel: 'mock-embed-v1',
  embeddingDimensions: 8,
  secretReference: 'env://AI_CHATBOT_MOCK_KEY',
  strictGrounding: true,
  maxResponseTokens: 500,
  temperature: 0.1,
  timeoutMs: 15000,
  retryCount: 1,
  retrieval: {
    topK: 5,
    finalContextCount: 3,
    minimumSimilarity: null,
    maximumContextTokens: null,
    keywordSearchEnabled: false,
    rerankerEnabled: false
  },
  featureFlags: {
    documentUpload: false,
    autoHandoff: false,
    analytics: false
  }
};

describe('AI chatbot request validation', () => {
  it('accepts a secret-manager reference without treating it as a raw key', () => {
    expect(parseIntegrationUpdate(integrationInput)).toMatchObject({
      provider: 'mock',
      secretReference: 'env://AI_CHATBOT_MOCK_KEY',
      strictGrounding: true
    });
  });

  it('accepts a provider API key for encrypted server-side storage', () => {
    const { secretReference: _secretReference, ...withoutReference } = integrationInput;
    const parsed = parseIntegrationUpdate({
      ...withoutReference,
      apiKey: 'sk-test-provider-key-123456789'
    });

    expect(parsed.apiKey).toBe('sk-test-provider-key-123456789');
    expect(parsed).not.toHaveProperty('secretReference');
  });

  it('rejects invalid API keys and conflicting credential inputs', () => {
    expect(() =>
      parseIntegrationUpdate({ ...integrationInput, apiKey: 'too-short' })
    ).toThrow(/cannot be changed together/);
    const { secretReference: _secretReference, ...withoutReference } = integrationInput;
    expect(() =>
      parseIntegrationUpdate({ ...withoutReference, apiKey: 'short' })
    ).toThrow(/between 8 and 500/);
  });

  it('rejects plaintext-looking secrets and disabled strict grounding', () => {
    expect(() =>
      parseIntegrationUpdate({
        ...integrationInput,
        secretReference: 'sk-plaintext-secret'
      })
    ).toThrow(/secret-manager URI/);
    expect(() =>
      parseIntegrationUpdate({ ...integrationInput, strictGrounding: false })
    ).toThrow(/must remain true/);
  });

  it('rejects retrieval counts that exceed topK', () => {
    expect(() =>
      parseIntegrationUpdate({
        ...integrationInput,
        retrieval: {
          ...integrationInput.retrieval,
          finalContextCount: 6
        }
      })
    ).toThrow(/cannot exceed/);
  });

  it('validates the minimum safe prompt fields', () => {
    expect(
      parsePromptCreate({
        name: 'FAQ Indonesia',
        primaryLanguage: 'id',
        tone: 'hangat',
        systemInstruction:
          'Jawab hanya menggunakan knowledge resmi yang diberikan dan jangan pernah membuat diagnosis.',
        fallbackMessage: 'Informasi belum tersedia di Knowledge Base RAHO.',
        handoffMessage: 'Pertanyaan akan diteruskan kepada Admin RAHO.',
        disclaimerText: null,
        maxAnswerLength: 800
      })
    ).toMatchObject({ name: 'FAQ Indonesia', maxAnswerLength: 800 });
  });
});
