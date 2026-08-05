import {
  AiProviderRegistry,
  DeterministicMockAiProvider,
  OpenAiCompatibleProvider
} from '../src/services/ai-provider.service.js';

afterEach(() => {
  delete process.env.SPRINT4_TEST_PROVIDER_KEY;
  vi.unstubAllGlobals();
});

describe('deterministic AI provider adapter', () => {
  it('returns stable embeddings without a network or provider credential', async () => {
    const provider = new DeterministicMockAiProvider();
    const first = await provider.embed('mock-embed-v1', ['Halo RAHO']);
    const second = await provider.embed('mock-embed-v1', ['Halo RAHO']);

    expect(first).toEqual(second);
    expect(first[0]).toHaveLength(8);
  });

  it('fails safely when no grounding context is supplied', async () => {
    const result = await new DeterministicMockAiProvider().generate({
      model: 'mock-chat-v1',
      systemInstruction: 'Use context only',
      question: 'Apa jawabannya?',
      contexts: []
    });

    expect(result).toMatchObject({
      answerStatus: 'unsupported',
      handoffRequired: true,
      sourceIds: []
    });
  });

  it('does not silently select an unknown provider', () => {
    const registry = new AiProviderRegistry();
    expect(registry.getChatProvider('unknown')).toBeNull();
    expect(registry.getEmbeddingProvider('unknown')).toBeNull();
  });

  it('resolves an environment secret only inside the compatible provider call', async () => {
    process.env.SPRINT4_TEST_PROVIDER_KEY = 'secret-test-value';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAiCompatibleProvider('https://provider.invalid/v1');

    await expect(provider.embed('embed-v1', ['Halo'], {
      secretReference: 'env://SPRINT4_TEST_PROVIDER_KEY'
    })).resolves.toEqual([[0.1, 0.2, 0.3]]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://provider.invalid/v1/embeddings',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret-test-value' })
      })
    );
  });

  it('parses structured chat output and rejects malformed provider output', async () => {
    process.env.SPRINT4_TEST_PROVIDER_KEY = 'secret-test-value';
    const provider = new OpenAiCompatibleProvider('https://provider.invalid/v1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        answer: 'Jawaban resmi', answer_status: 'supported',
        requires_disclaimer: false, customer_interest: false,
        needs_handoff: false, handoff_reason: null,
        used_knowledge_ids: ['chunk-1']
      }) } }],
      usage: { prompt_tokens: 12, completion_tokens: 4 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(provider.generate({
      model: 'chat-v1', systemInstruction: 'Grounded only', question: 'Apa?',
      contexts: [{ id: 'chunk-1', content: 'Jawaban resmi' }],
      secretReference: 'env://SPRINT4_TEST_PROVIDER_KEY'
    })).resolves.toMatchObject({
      answer: 'Jawaban resmi', answerStatus: 'supported',
      usedKnowledgeIds: ['chunk-1'], inputTokens: 12, outputTokens: 4
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{not-json' } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await expect(provider.generate({
      model: 'chat-v1', systemInstruction: 'Grounded only', question: 'Apa?',
      contexts: [{ id: 'chunk-1', content: 'Jawaban resmi' }],
      secretReference: 'env://SPRINT4_TEST_PROVIDER_KEY'
    })).rejects.toThrow('malformed JSON');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        answer: 'Jawaban resmi', answer_status: 'supported',
        requires_disclaimer: false, customer_interest: false,
        needs_handoff: false, handoff_reason: null,
        used_knowledge_ids: ['chunk-1'], injected_field: 'should fail'
      }) } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await expect(provider.generate({
      model: 'chat-v1', systemInstruction: 'Grounded only', question: 'Apa?',
      contexts: [{ id: 'chunk-1', content: 'Jawaban resmi' }],
      secretReference: 'env://SPRINT4_TEST_PROVIDER_KEY'
    })).rejects.toThrow('malformed structured output');
  });
});
