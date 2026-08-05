import type {
  AiChatbotFoundationResponse,
  AiIntegrationResponse,
  AiPromptListResponse,
  AiRagResultResponse,
  KnowledgeCategoryListResponse,
  KnowledgeDocumentListResponse,
  KnowledgeListResponse
} from '../api/contracts';

export const mockAiChatbotFoundation: AiChatbotFoundationResponse = {
  data: {
    apiVersion: 'v1',
    phase: 'sprint_6',
    status: 'development_ready',
    runtime: {
      enabled: false,
      customerTraffic: 'disabled',
      mode: 'rag',
      sourceOfTruth: 'knowledge_base',
      strictGrounding: true
    },
    tenant: {
      state: 'disabled',
      strategy: 'single_tenant_bootstrap',
      tenantId: '00000000-0000-4000-8000-000000000001'
    },
    provider: {
      state: 'not_instrumented',
      name: null,
      chatModel: null,
      embeddingModel: null,
      secretReferenceConfigured: false
    },
    infrastructure: {
      vectorStore: {
        state: 'not_instrumented',
        adapter: 'postgresql_pgvector'
      },
      queue: { state: 'disabled', adapter: 'redis' },
      objectStorage: { state: 'disabled', adapter: 's3_compatible' }
    },
    guardrails: {
      faqOnly: true,
      booking: false,
      payments: false,
      diagnosis: false,
      personalizedMedicalAdvice: false,
      freeGenerationWithoutContext: false,
      fallbackAndHandoff: true
    },
    modules: [
      { key: 'overview', label: 'Overview', path: '/ai-chatbot/overview', state: 'available', targetSprint: 0 },
      { key: 'knowledge', label: 'Knowledge Base', path: '/ai-chatbot/knowledge', state: 'available', targetSprint: 2 },
      { key: 'instructions', label: 'AI Instructions', path: '/ai-chatbot/instructions', state: 'available', targetSprint: 1 },
      { key: 'playground', label: 'Testing Playground', path: '/ai-chatbot/playground', state: 'available', targetSprint: 4 },
      { key: 'conversations', label: 'Conversation Logs', path: '/ai-chatbot/conversations', state: 'available', targetSprint: 6 },
      { key: 'unanswered', label: 'Unanswered Questions', path: '/ai-chatbot/unanswered', state: 'available', targetSprint: 6 },
      { key: 'handoffs', label: 'Handoff Queue', path: '/ai-chatbot/handoffs', state: 'available', targetSprint: 5 },
      { key: 'analytics', label: 'Analytics', path: '/ai-chatbot/analytics', state: 'planned', targetSprint: 7 },
      { key: 'settings', label: 'Settings', path: '/ai-chatbot/settings', state: 'available', targetSprint: 1 }
    ]
  },
  meta: {
    requestId: 'req_mock_ai_foundation',
    generatedAt: '2026-08-04T07:00:00.000Z'
  }
};

export const mockAiRagResult: AiRagResultResponse = {
  data: {
    conversationId: '56aeb539-514a-4eb0-a44c-5f34cc29e5a2',
    reply: 'RAHO Club menyediakan informasi layanan berdasarkan knowledge resmi.',
    answerStatus: 'supported',
    requiresDisclaimer: false,
    customerInterest: false,
    handoff: false,
    handoffReason: null,
    usedKnowledge: [{
      chunkId: '4d1b0f8b-6369-4a20-b85c-9734f9c9a842', title: 'RAHO Club',
      section: 'Layanan', sourceType: 'faq', documentId: null,
      knowledgeVersionId: 'bb83bc62-4159-4b37-bdcb-8ea2fe93d896', score: 0.91,
      rank: 1, usedInPrompt: true, usedInAnswer: true
    }],
    retrievedKnowledge: [{
      chunkId: '4d1b0f8b-6369-4a20-b85c-9734f9c9a842', title: 'RAHO Club',
      section: 'Layanan', sourceType: 'faq', documentId: null,
      knowledgeVersionId: 'bb83bc62-4159-4b37-bdcb-8ea2fe93d896', score: 0.91,
      rank: 1, usedInPrompt: true, usedInAnswer: true
    }],
    traceId: 'af924761-829f-41b3-ac80-01163852cb76',
    model: 'mock-chat-v1',
    promptVersionId: '1b1bf8aa-b080-49d0-b5cc-5ac96bd5d809',
    inputTokens: 120,
    outputTokens: 20,
    retrievalLatencyMs: 14,
    providerLatencyMs: 22,
    latencyMs: 42,
    validationStatus: 'validated',
    providerCalled: true,
    idempotentReplay: false,
    safetyCategory: 'normal_faq',
    safetyFlags: [],
    fallbackReason: null,
    outputValidationReasons: [],
    interestConfidence: 0,
    historyMessagesUsed: 2,
    handoffId: null,
    handoffCreated: false
  },
  meta: { requestId: 'req_mock_rag', generatedAt: '2026-08-05T02:00:00.000Z' }
};

export const mockAiIntegration: AiIntegrationResponse = {
  data: {
    integration: {
      id: '37b38a20-371f-4e9a-9d4a-b8df5f546acd',
      tenantId: '00000000-0000-4000-8000-000000000001',
      name: 'RAHO AI',
      provider: 'mock',
      chatModel: 'mock-chat-v1',
      embeddingProvider: 'mock',
      embeddingModel: 'mock-embed-v1',
      embeddingDimensions: 8,
      secretReferenceConfigured: true,
      active: false,
      effectiveEnabled: false,
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
      },
      revision: 1,
      updatedAt: '2026-08-05T01:00:00.000Z'
    },
    readiness: {
      effectiveEnabled: false,
      blockers: [
        {
          code: 'GLOBAL_RUNTIME_HARD_OFF',
          message: 'Customer AI runtime is intentionally unavailable.'
        },
        {
          code: 'PUBLISHED_PROMPT_MISSING',
          message: 'An approved and published AI instruction is required.'
        }
      ],
      dependencies: {
        vectorStore: 'reachable',
        queue: 'reachable',
        objectStorage: 'reachable',
        chatProvider: 'reachable',
        embeddingProvider: 'reachable',
        checkedAt: '2026-08-05T01:00:00.000Z'
      },
      publishedPromptConfigured: false
    }
  },
  meta: {
    requestId: 'req_mock_ai_integration',
    generatedAt: '2026-08-05T01:00:00.000Z'
  }
};

export const mockAiPrompts: AiPromptListResponse = {
  data: [
    {
      id: '2502fb9f-7007-457b-a318-a3a1a64e8bc4',
      tenantId: '00000000-0000-4000-8000-000000000001',
      name: 'FAQ Indonesia',
      version: 1,
      status: 'draft',
      primaryLanguage: 'id',
      tone: 'hangat',
      systemInstruction:
        'Jawab hanya berdasarkan knowledge resmi yang diberikan dan jangan membuat diagnosis atau janji hasil.',
      fallbackMessage: 'Informasi belum tersedia di Knowledge Base RAHO.',
      handoffMessage: 'Pertanyaan akan diteruskan kepada Admin RAHO.',
      disclaimerText: null,
      maxAnswerLength: 800,
      createdBy: '2a99543d-80d5-47a0-92ef-a389ce1a3001',
      approvedBy: null,
      createdAt: '2026-08-05T01:00:00.000Z',
      approvedAt: null,
      publishedAt: null
    }
  ],
  meta: {
    requestId: 'req_mock_ai_prompts',
    generatedAt: '2026-08-05T01:00:00.000Z',
    nextCursor: null
  }
};

export const mockKnowledgeCategories: KnowledgeCategoryListResponse = {
  data: [
    {
      id: 'b1fc4d88-b493-4f49-a8f0-f03ac965db2c',
      tenantId: '00000000-0000-4000-8000-000000000001',
      name: 'Kesehatan dan Kelayakan',
      slug: 'kesehatan-dan-kelayakan',
      description: 'FAQ kesehatan umum yang telah direview.',
      active: true,
      sortOrder: 7,
      revision: 1,
      knowledgeCount: 1,
      createdAt: '2026-08-05T02:00:00.000Z',
      updatedAt: '2026-08-05T02:00:00.000Z'
    }
  ],
  meta: { requestId: 'req_mock_categories', generatedAt: '2026-08-05T02:00:00.000Z' }
};

export const mockKnowledge: KnowledgeListResponse = {
  data: [
    {
      id: '8892899c-b84c-4afb-9d13-174fea4ff09b',
      tenantId: '00000000-0000-4000-8000-000000000001',
      categoryId: 'b1fc4d88-b493-4f49-a8f0-f03ac965db2c',
      categoryName: 'Kesehatan dan Kelayakan',
      sourceType: 'faq',
      versionId: '196c11bf-843b-4fe6-847f-f3665d1f115f',
      version: 1,
      revision: 1,
      status: 'draft',
      title: 'Keamanan terapi untuk lansia',
      question: 'Apakah terapi RAHO aman untuk lansia?',
      questionVariants: ['Orang tua boleh ikut?'],
      content: 'Kelayakan mengikuti layanan harus dikonfirmasi sesuai kebijakan resmi RAHO.',
      sourceReference: 'SOP layanan RAHO',
      internalNotes: 'Menunggu review Knowledge Owner.',
      tags: ['lansia', 'kelayakan'],
      metadata: {},
      contentFingerprint: 'a'.repeat(64),
      requiresDisclaimer: true,
      priority: 20,
      validFrom: null,
      validUntil: null,
      expired: false,
      createdBy: '2a99543d-80d5-47a0-92ef-a389ce1a3001',
      approvedBy: null,
      publishedBy: null,
      changeReason: null,
      createdAt: '2026-08-05T02:00:00.000Z',
      updatedAt: '2026-08-05T02:00:00.000Z',
      approvedAt: null,
      publishedAt: null
    }
  ],
  meta: { requestId: 'req_mock_knowledge', generatedAt: '2026-08-05T02:00:00.000Z', nextCursor: null }
};

export const mockKnowledgeDocuments: KnowledgeDocumentListResponse = {
  data: [
    {
      id: '03d5c308-8124-4d65-b8ab-2ba94691de09',
      tenantId: '00000000-0000-4000-8000-000000000001',
      categoryId: 'b1fc4d88-b493-4f49-a8f0-f03ac965db2c',
      categoryName: 'Kesehatan dan Kelayakan',
      filename: 'panduan-layanan.txt',
      mimeType: 'text/plain',
      extension: 'txt',
      fileSize: 2048,
      contentSha256: 'c'.repeat(64),
      status: 'ready',
      processingRevision: 1,
      attemptCount: 1,
      extractedCharacterCount: 1800,
      pageCount: null,
      totalChunks: 2,
      errorCode: null,
      errorMessage: null,
      uploadedBy: '2a99543d-80d5-47a0-92ef-a389ce1a3001',
      uploadedByName: 'Local Admin',
      createdAt: '2026-08-05T03:00:00.000Z',
      updatedAt: '2026-08-05T03:01:00.000Z',
      processedAt: '2026-08-05T03:01:00.000Z'
    }
  ],
  meta: { requestId: 'req_mock_documents', generatedAt: '2026-08-05T03:01:00.000Z', nextCursor: null }
};
