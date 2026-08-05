import request from 'supertest';
import { createApp } from '../src/app.js';
import type { AuthenticatedAdmin, LoginResult } from '../src/auth/types.js';
import type { AdminAuthService } from '../src/services/admin-auth.service.js';
import type { AuditService } from '../src/services/audit.service.js';
import type { MessageService } from '../src/services/message.service.js';
import type { ReadModelService } from '../src/services/read-model.service.js';
import type { HandoffService } from '../src/services/handoff.service.js';
import type { OutboxService } from '../src/services/outbox.service.js';
import type { ChatbotService } from '../src/services/chatbot.service.js';
import type { SafetyCenterService } from '../src/services/safety-center.service.js';
import type { OverviewService } from '../src/services/overview.service.js';
import {
  TenantContextResolutionError,
  type TenantContextService
} from '../src/services/tenant-context.service.js';
import type { AiChatbotService } from '../src/services/ai-chatbot.service.js';
import type { KnowledgeService } from '../src/services/knowledge.service.js';
import type { DocumentService } from '../src/services/document.service.js';
import type { AiRagRuntimeService } from '../src/services/ai-rag-runtime.service.js';
import type { AiOperationsService } from '../src/services/ai-operations.service.js';
import { AppError } from '../src/middleware/error.middleware.js';
import {
  ReconnectNotAllowedError,
  type WhatsAppService
} from '../src/services/whatsapp.service.js';
import { env } from '../src/config/env.js';

const admin: AuthenticatedAdmin = {
  id: '2a99543d-80d5-47a0-92ef-a389ce1a3001',
  username: 'admin',
  displayName: 'Local Admin',
  role: 'admin',
  permissions: [
    'dashboard.read',
    'messages.send',
    'messages.read',
    'messages.cancel',
    'contacts.read',
    'handoffs.manage',
    'session.reconnect',
    'safety.pause',
    'safety.resume',
    'session.reset',
    'chatbot.manage'
  ],
  sessionId: 'c8d4e03a-1884-4ec6-85ae-c99a969f2483',
  csrfTokenHash: 'csrf-hash',
  expiresAt: new Date('2099-01-01T00:00:00.000Z')
};

const loginResult: LoginResult = {
  user: admin,
  sessionId: admin.sessionId,
  sessionToken: 'session-token',
  csrfToken: 'csrf-token',
  expiresAt: new Date(Date.now() + 60_000)
};

const overview = {
  readiness: {
    readyToSend: false,
    blockers: ['whatsapp_disconnected'],
    database: 'connected',
    eventStream: 'unknown'
  },
  session: {
    state: 'disconnected',
    connectedSince: null,
    lastDisconnect: null,
    reconnect: {
      attempt: 0,
      nextRetryAt: null,
      eligible: true,
      disabledReason: null
    },
    browser: {
      platform: 'Ubuntu',
      name: 'Simple WhatsApp Chatbot'
    },
    credentialUpdatedAt: null
  },
  safety: {
    risk: 'unknown',
    score: null,
    paused: true,
    reasons: ['Safety statistics are unavailable'],
    recommendation: 'Do not send until safety statistics are available.'
  },
  rates: { minute: null, hour: null, day: null },
  warmup: null,
  outbox: null,
  followUp: null,
  capabilities: {
    safety: 'unavailable',
    outbox: 'disabled',
    followUp: 'disabled',
    eventStream: 'enabled'
  },
  recentEvents: []
};

const openHandoff = {
  id: '9b5fd595-cfb4-48f0-8a64-d64a130176ba',
  contactId: '42',
  sourceMessageId: '9',
  state: 'open' as const,
  assigneeUserId: null,
  dueAt: '2026-07-31T03:00:00.000Z',
  resolvedAt: null,
  resolutionNote: null,
  tenantId: '00000000-0000-4000-8000-000000000001',
  aiConversationId: '56aeb539-514a-4eb0-a44c-5f34cc29e5a2',
  aiMessageTraceId: 'f03c6dbb-5e82-47d6-b6b9-7aa0113456b1',
  reason: 'customer_interested',
  priority: 'normal' as const,
  summary: 'Customer meminta langkah berikutnya.',
  knowledgeIds: [],
  safetyCategory: 'normal_faq',
  traceId: 'trace_sprint_5',
  createdAt: '2026-07-30T03:00:00.000Z',
  updatedAt: '2026-07-30T03:00:00.000Z',
  contact: {
    displayName: 'Rina',
    maskedPhone: '6281***890'
  },
  sourcePreview: '5'
};

const logicalMessageId = '59942ce7-4f15-4a8b-9448-a98f39d70d10';
const outboxId = '2ddb725d-56c0-4708-8d81-1b868a3e8bd9';
const activeChatbotVersionId = '3ca59c93-89f4-4c34-bb27-7d9e0887781b';
const chatbotRuleId = 'ec53bfd2-a990-4e1a-866c-45145ee96c93';
const aiIntegration = {
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
  effectiveEnabled: false as const,
  strictGrounding: true as const,
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
};
const aiReadiness = {
  effectiveEnabled: false as const,
  blockers: [
    {
      code: 'GLOBAL_RUNTIME_HARD_OFF',
      message: 'Customer runtime is not implemented.'
    }
  ],
  dependencies: {
    vectorStore: 'reachable' as const,
    queue: 'reachable' as const,
    objectStorage: 'reachable' as const,
    chatProvider: 'reachable' as const,
    embeddingProvider: 'reachable' as const,
    checkedAt: '2026-08-05T01:00:00.000Z'
  },
  publishedPromptConfigured: false
};
const aiPrompt = {
  id: '2502fb9f-7007-457b-a318-a3a1a64e8bc4',
  tenantId: aiIntegration.tenantId,
  name: 'FAQ Indonesia',
  version: 1,
  status: 'draft' as const,
  primaryLanguage: 'id',
  tone: 'hangat',
  systemInstruction:
    'Jawab hanya berdasarkan knowledge resmi yang diberikan kepada model.',
  fallbackMessage: 'Informasi belum tersedia di Knowledge Base RAHO.',
  handoffMessage: 'Pertanyaan akan diteruskan kepada Admin RAHO.',
  disclaimerText: null,
  maxAnswerLength: 800,
  createdBy: admin.id,
  approvedBy: null,
  createdAt: '2026-08-05T01:00:00.000Z',
  approvedAt: null,
  publishedAt: null
};
const aiIntegrationUpdateInput = {
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
  retrieval: aiIntegration.retrieval,
  featureFlags: aiIntegration.featureFlags
};
const knowledgeCategory = {
  id: 'b1fc4d88-b493-4f49-a8f0-f03ac965db2c',
  tenantId: aiIntegration.tenantId,
  name: 'Kesehatan dan Kelayakan',
  slug: 'kesehatan-dan-kelayakan',
  description: null,
  active: true,
  sortOrder: 7,
  revision: 1,
  knowledgeCount: 1,
  createdAt: '2026-08-05T02:00:00.000Z',
  updatedAt: '2026-08-05T02:00:00.000Z'
};
const knowledgeItem = {
  id: '8892899c-b84c-4afb-9d13-174fea4ff09b',
  tenantId: aiIntegration.tenantId,
  categoryId: knowledgeCategory.id,
  categoryName: knowledgeCategory.name,
  sourceType: 'faq' as const,
  versionId: '196c11bf-843b-4fe6-847f-f3665d1f115f',
  version: 1,
  revision: 1,
  status: 'draft' as const,
  title: 'Keamanan terapi untuk lansia',
  question: 'Apakah terapi RAHO aman untuk lansia?',
  questionVariants: ['Orang tua boleh ikut?'],
  content: 'Jawaban resmi RAHO.',
  sourceReference: 'SOP layanan RAHO',
  internalNotes: null,
  tags: ['lansia'],
  metadata: {},
  contentFingerprint: 'a'.repeat(64),
  requiresDisclaimer: true,
  priority: 20,
  validFrom: null,
  validUntil: null,
  expired: false,
  createdBy: admin.id,
  approvedBy: null,
  publishedBy: null,
  changeReason: null,
  createdAt: '2026-08-05T02:00:00.000Z',
  updatedAt: '2026-08-05T02:00:00.000Z',
  approvedAt: null,
  publishedAt: null
};
const knowledgeWriteInput = {
  categoryId: knowledgeCategory.id,
  sourceType: 'faq',
  title: knowledgeItem.title,
  question: knowledgeItem.question,
  questionVariants: knowledgeItem.questionVariants,
  content: knowledgeItem.content,
  sourceReference: knowledgeItem.sourceReference,
  internalNotes: null,
  tags: knowledgeItem.tags,
  metadata: {},
  requiresDisclaimer: true,
  priority: 20,
  validFrom: null,
  validUntil: null
};
const knowledgeDocument = {
  id: '03d5c308-8124-4d65-b8ab-2ba94691de09',
  tenantId: aiIntegration.tenantId,
  categoryId: knowledgeCategory.id,
  categoryName: knowledgeCategory.name,
  filename: 'panduan.txt',
  mimeType: 'text/plain',
  extension: 'txt',
  fileSize: 64,
  contentSha256: 'c'.repeat(64),
  status: 'uploaded' as const,
  processingRevision: 0,
  attemptCount: 0,
  extractedCharacterCount: 0,
  pageCount: null,
  totalChunks: 0,
  errorCode: null,
  errorMessage: null,
  uploadedBy: admin.id,
  uploadedByName: admin.displayName,
  createdAt: '2026-08-05T03:00:00.000Z',
  updatedAt: '2026-08-05T03:00:00.000Z',
  processedAt: null
};
const candidateChatbotRules = [
  {
    triggerType: 'empty',
    triggerValues: [],
    responseText: 'Please send a message',
    priority: 0,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'exact',
    triggerValues: ['menu'],
    responseText: 'Unsaved menu',
    priority: 10,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'fallback',
    triggerValues: [],
    responseText: 'Fallback',
    priority: 1000,
    enabled: true,
    action: 'reply'
  }
];

const createTestApp = (options: {
  authenticated?: AuthenticatedAdmin | null;
  login?: LoginResult | null;
  pairingQr?: { qr: string; expiresAt: string } | null;
  reconnectError?: Error;
  contactExists?: boolean;
  aiChatbotService?: AiChatbotService;
  knowledgeService?: KnowledgeService;
  documentService?: DocumentService;
  aiRagRuntimeService?: AiRagRuntimeService;
  aiOperationsService?: AiOperationsService;
  tenantContextService?: TenantContextService;
} = {}) => {
  const whatsappService = {
    getStatus: vi.fn(() => 'disconnected'),
    getOperationalStatus: vi.fn(() => overview.session),
    getPairingQr: vi.fn(() =>
      options.pairingQr === undefined
        ? {
            qr: 'raw-pairing-value',
            expiresAt: new Date(Date.now() + 60_000).toISOString()
          }
        : options.pairingQr
    ),
    requestReconnect: vi.fn(async () => {
      if (options.reconnectError) throw options.reconnectError;
      return overview.session;
    }),
    resetCredentials: vi.fn(async () => overview.session),
    pauseSending: vi.fn(),
    isSendingPaused: vi.fn(() => true)
  } as unknown as WhatsAppService;
  const messageService = {} as MessageService;
  const adminAuthService = {
    login: vi.fn(async () => options.login ?? loginResult),
    authenticate: vi.fn(async () =>
      options.authenticated === undefined ? admin : options.authenticated
    ),
    verifyCsrf: vi.fn(
      (_auth: AuthenticatedAdmin, token: string) => token === 'csrf-token'
    ),
    verifyUserPassword: vi.fn(async (_userId: string, password: string) =>
      password === 'admin123'
    ),
    revokeSession: vi.fn(async () => undefined)
  } as unknown as AdminAuthService;
  const auditService = {
    record: vi.fn(async () => undefined)
  } as unknown as AuditService;
  const authenticatedAdmin =
    options.authenticated === undefined ? admin : options.authenticated;
  const tenantContextService = options.tenantContextService ?? ({
    resolveForAdmin: vi.fn(async () => ({
      tenantId: '00000000-0000-4000-8000-000000000001',
      slug: 'raho',
      name: 'RAHO',
      permissions: authenticatedAdmin?.permissions.includes('chatbot.manage')
        ? [
            'ai.settings.read',
            'ai.settings.manage',
            'ai.prompts.read',
            'ai.prompts.manage',
            'ai.prompts.approve',
            'ai.playground.use',
            'ai.logs.read',
            'ai.feedback.manage',
            'ai.unanswered.manage',
            'ai.evaluations.manage',
            'knowledge.read',
            'knowledge.edit',
            'knowledge.review',
            'knowledge.publish',
            'knowledge.categories.manage'
          ]
        : []
    }))
  } as unknown as TenantContextService);
  const aiChatbotService = options.aiChatbotService ?? ({
    getIntegration: vi.fn(async () => aiIntegration),
    getReadiness: vi.fn(async () => aiReadiness),
    updateIntegration: vi.fn(async () => ({
      before: aiIntegration,
      after: { ...aiIntegration, revision: 2 }
    })),
    testConnection: vi.fn(async () => ({
      chatProvider: 'reachable' as const,
      embeddingProvider: 'reachable' as const,
      testedAt: '2026-08-05T01:00:00.000Z'
    })),
    activate: vi.fn(async () => {
      throw new AppError(
        'AI activation remains blocked',
        409,
        'AI_ACTIVATION_BLOCKED',
        { blockers: aiReadiness.blockers }
      );
    }),
    deactivate: vi.fn(async () => ({
      before: aiIntegration,
      after: { ...aiIntegration, revision: 2 }
    })),
    listPrompts: vi.fn(async () => ({ data: [aiPrompt], nextCursor: null })),
    createPrompt: vi.fn(async () => aiPrompt),
    approvePrompt: vi.fn(async () => ({
      ...aiPrompt,
      status: 'approved' as const,
      approvedBy: admin.id,
      approvedAt: '2026-08-05T02:00:00.000Z'
    })),
    publishPrompt: vi.fn(async () => ({
      ...aiPrompt,
      status: 'published' as const,
      publishedAt: '2026-08-05T03:00:00.000Z'
    }))
  } as unknown as AiChatbotService);
  const knowledgeService = options.knowledgeService ?? ({
    listCategories: vi.fn(async () => [knowledgeCategory]),
    createCategory: vi.fn(async () => knowledgeCategory),
    updateCategory: vi.fn(async () => ({
      before: knowledgeCategory,
      after: { ...knowledgeCategory, revision: 2 }
    })),
    deleteCategory: vi.fn(async () => knowledgeCategory),
    listKnowledge: vi.fn(async () => ({ data: [knowledgeItem], nextCursor: null })),
    getKnowledge: vi.fn(async () => knowledgeItem),
    createKnowledge: vi.fn(async () => knowledgeItem),
    updateKnowledge: vi.fn(async () => ({
      before: knowledgeItem,
      after: { ...knowledgeItem, revision: 2 },
      createdVersion: false
    })),
    deleteDraft: vi.fn(async () => knowledgeItem),
    transitionKnowledge: vi.fn(async () => ({
      before: knowledgeItem,
      after: { ...knowledgeItem, status: 'review' as const, revision: 2 }
    })),
    bulkAction: vi.fn(async () => [{ ...knowledgeItem, status: 'published' as const }])
  } as unknown as KnowledgeService);
  const documentService = options.documentService ?? ({
    upload: vi.fn(async () => knowledgeDocument),
    list: vi.fn(async () => ({ data: [knowledgeDocument], nextCursor: null })),
    get: vi.fn(async () => knowledgeDocument),
    preview: vi.fn(async () => ({
      document: knowledgeDocument,
      extractionPreview: 'Informasi resmi RAHO.',
      chunks: []
    })),
    enqueueDocument: vi.fn(async () => ({
      ...knowledgeDocument,
      status: 'queued' as const,
      processingRevision: 1
    })),
    archive: vi.fn(async () => ({ ...knowledgeDocument, status: 'archived' as const })),
    delete: vi.fn(async () => knowledgeDocument),
    searchTest: vi.fn(async () => []),
    enqueueKnowledgeIndex: vi.fn(async () => true),
    enqueueCurrentPublishedKnowledge: vi.fn(async () => true),
    deactivateKnowledge: vi.fn(async () => undefined)
  } as unknown as DocumentService);
  const aiRagRuntimeService = options.aiRagRuntimeService ?? ({
    respond: vi.fn(async () => ({
      conversationId: '56aeb539-514a-4eb0-a44c-5f34cc29e5a2',
      reply: 'Jawaban grounded dari knowledge resmi.',
      answerStatus: 'supported' as const,
      requiresDisclaimer: false,
      customerInterest: false,
      handoff: false,
      handoffReason: null,
      usedKnowledge: [],
      retrievedKnowledge: [],
      traceId: 'af924761-829f-41b3-ac80-01163852cb76',
      model: 'mock-chat-v1',
      promptVersionId: '2502fb9f-7007-457b-a318-a3a1a64e8bc4',
      inputTokens: 20,
      outputTokens: 8,
      retrievalLatencyMs: 2,
      providerLatencyMs: 3,
      latencyMs: 7,
      validationStatus: 'validated' as const,
      providerCalled: true,
      idempotentReplay: false
    }))
  } as unknown as AiRagRuntimeService);
  const aiOperationsService = options.aiOperationsService ?? ({
    listConversations: vi.fn(async () => ({ data: [{
      id: '56aeb539-514a-4eb0-a44c-5f34cc29e5a2', contactId: '42',
      customer: { displayName: 'Rina', maskedIdentifier: '6281***890' },
      channel: 'playground', channelSessionId: 'session', status: 'active',
      topic: 'FAQ', interested: false, summary: 'Pertanyaan FAQ', lastKnowledgeIds: [],
      handoffStatus: null, traceCount: 1, fallbackCount: 0, handoff: false,
      lastAnswerStatus: 'supported', lastModel: 'mock-chat-v1',
      lastTraceId: 'af924761-829f-41b3-ac80-01163852cb76', reviewedBy: null,
      startedAt: '2026-08-05T01:00:00.000Z', lastMessageAt: '2026-08-05T01:00:00.000Z', closedAt: null
    }], nextCursor: null })),
    getConversation: vi.fn(async () => ({ id: '56aeb539-514a-4eb0-a44c-5f34cc29e5a2' })),
    listConversationMessages: vi.fn(async () => ({ data: [], nextCursor: null })),
    saveFeedback: vi.fn(async (_tenant: string, _trace: string, reviewerId: string) => ({
      id: 'b44c102a-b311-40ac-8080-f8a86fcfe3c1', type: 'correct', comment: null,
      correctKnowledgeIds: [], suggestedAnswer: null, reviewerId,
      reviewedAt: '2026-08-05T01:00:00.000Z'
    })),
    listUnanswered: vi.fn(async () => ({ data: [], nextCursor: null })),
    updateUnanswered: vi.fn(async () => ({ id: 'bd5875bf-c78f-492f-a736-886aedf219b9', status: 'reviewing' })),
    createKnowledgeFromUnanswered: vi.fn(async () => ({ unanswered: { status: 'knowledge_created' }, knowledge: knowledgeItem })),
    listTestCases: vi.fn(async () => []),
    createTestCase: vi.fn(async () => ({ id: 'ea9f426f-17bd-47f7-a260-6017017fdd46', name: 'FAQ test' })),
    updateTestCase: vi.fn(async () => ({ id: 'ea9f426f-17bd-47f7-a260-6017017fdd46', name: 'FAQ test' })),
    runTestCase: vi.fn(async () => ({ id: '12c0a68b-7483-416c-803a-2589cf4aac84', passed: true })),
    runBatch: vi.fn(async () => ({ total: 1, passed: 1, failed: 0, passRate: 1, runs: [] }))
  } as unknown as AiOperationsService);
  const overviewService = {
    getOverview: vi.fn(async () => overview)
  } as unknown as OverviewService;
  const readModelService = {
    listConversations: vi.fn(async () => ({
      data: [
        {
          id: '42',
          displayName: 'Rina',
          maskedPhone: '6281***890',
          identityStatus: 'resolved',
          lastMessage: {
            id: '9',
            preview: 'Halo',
            direction: 'incoming',
            messageType: 'text',
            occurredAt: '2026-07-30T03:00:00.000Z'
          },
          lastOutgoingStatus: 'sent',
          counts: { incoming: 2, outgoing: 1 }
        }
      ],
      nextCursor: 'next-conversation-cursor'
    })),
    getContact: vi.fn(async () =>
      options.contactExists === false
        ? null
        : {
            id: '42',
            displayName: 'Rina',
            maskedPhone: '6281***890'
          }
    ),
    listMessages: vi.fn(async () => ({
      data: [
        {
          id: '9',
          providerMessageId: 'provider-9',
          direction: 'incoming',
          messageType: 'text',
          content: 'Halo',
          state: 'received',
          createdAt: '2026-07-30T03:00:00.000Z'
        }
      ],
      nextCursor: null
    })),
    listContacts: vi.fn(async () => ({
      data: [],
      nextCursor: null
    }))
  } as unknown as ReadModelService;
  const handoffService = {
    list: vi.fn(async () => ({ data: [openHandoff], nextCursor: null })),
    get: vi.fn(async () => openHandoff),
    assign: vi.fn(async (_id: string, assigneeUserId: string) => ({
      ...openHandoff,
      state: 'assigned' as const,
      assigneeUserId
    })),
    resolve: vi.fn(async (_id: string, resolutionNote: string) => ({
      ...openHandoff,
      state: 'resolved' as const,
      resolvedAt: '2026-07-30T04:00:00.000Z',
      resolutionNote
    })),
    markInProgress: vi.fn(async (_id: string, assigneeUserId: string) => ({
      ...openHandoff, state: 'in_progress' as const, assigneeUserId
    })),
    close: vi.fn(async (_id: string, resolutionNote: string) => ({
      ...openHandoff, state: 'closed' as const, resolutionNote,
      resolvedAt: '2026-07-30T04:00:00.000Z'
    }))
  } as unknown as HandoffService;
  const outboxService = {
    createMessage: vi.fn(async () => ({
      id: logicalMessageId,
      outboxId,
      state: 'accepted'
    })),
    getMessage: vi.fn(async () => ({
      message: { id: logicalMessageId, state: 'queued' },
      outbox: { id: outboxId, state: 'queued' },
      events: [{ id: '1', eventType: 'accepted' }]
    })),
    listOutbox: vi.fn(async () => ({
      data: [{ id: outboxId, messageId: logicalMessageId, state: 'queued' }],
      nextCursor: null
    })),
    cancel: vi.fn(async () => logicalMessageId),
    retry: vi.fn(async () => logicalMessageId),
    reconcileUnknown: vi.fn(async () => ({
      messageId: logicalMessageId,
      state: 'failed'
    }))
  } as unknown as OutboxService;
  const chatbotConfig = {
    revision: 3,
    updatedAt: '2026-07-30T03:00:00.000Z',
    rules: [
      {
        id: chatbotRuleId,
        triggerType: 'fallback' as const,
        triggerValues: [],
        responseText: 'Fallback',
        priority: 1000,
        enabled: true,
        action: 'reply' as const
      }
    ]
  };
  const chatbotService = {
    getConfig: vi.fn(async () => chatbotConfig),
    updateConfig: vi.fn(async () => ({
      config: { ...chatbotConfig, revision: 4 },
      audit: {
        resourceId: activeChatbotVersionId,
        before: { revision: 3, contentHash: 'old-hash', ruleCount: 1 },
        after: { revision: 4, contentHash: 'new-hash', ruleCount: 1 }
      }
    })),
    preview: vi.fn((input: string) => ({
      normalizedInput: input.trim().toLowerCase(),
      matchedRule: {
        triggerType: 'fallback',
        priority: 1000,
        matchedTrigger: null,
        action: 'reply'
      },
      response: 'Fallback'
    })),
    evaluate: vi.fn()
  } as unknown as ChatbotService;
  const safetySnapshot = {
    effectivePaused: true,
    manualPaused: true,
    mode: 'manual_pause',
    blockers: [
      {
        code: 'MANUAL_PAUSE',
        source: 'manual',
        message: 'Sending dihentikan manual.',
        recommendation: 'Admin dapat meninjau dan resume.',
        retryAt: null
      }
    ],
    health: {
      state: 'enabled',
      reason: null,
      risk: 'low',
      score: 8,
      autoPauseAt: 'medium',
      reasons: [],
      recommendation: 'Operate normally',
      stats: {
        disconnectsLastHour: 0,
        failedMessagesLastHour: 0,
        forbiddenErrors: 0,
        timelockErrors: 0,
        uptimeMs: 10_000
      }
    },
    rates: {
      state: 'enabled',
      reason: null,
      minute: { used: 0, limit: 5, utilization: 0 },
      hour: { used: 0, limit: 100, utilization: 0 },
      day: { used: 0, limit: 800, utilization: 0 }
    },
    warmup: {
      state: 'enabled',
      reason: null,
      data: {
        day: 1,
        totalDays: 10,
        sentToday: 0,
        limitToday: 15,
        remainingToday: 15,
        progressRatio: 0.1
      }
    },
    timelock: {
      state: 'enabled',
      reason: null,
      active: false,
      enforcementType: null,
      detectedAt: null,
      expiresAt: null,
      errorCount: 0
    },
    recovery: {
      state: 'enabled',
      reason: null,
      phase: 'graduated',
      rateMultiplier: 1,
      pauseRemainingMs: null,
      pauseUntil: null,
      estimatedFullRecoveryAt: null,
      recommendation: 'Operating normally',
      shouldReplaceNumber: false,
      resetEligible: true
    },
    delivery: {
      state: 'enabled',
      reason: null,
      data: {
        sentInWindow: 0,
        deliveredInWindow: 0,
        deliveryRate: null,
        sampleState: 'insufficient_sample',
        windowMs: 3_600_000
      }
    },
    retry: { state: 'disabled', reason: 'Disabled', data: null },
    reconnect: { state: 'disabled', reason: 'Disabled', data: null },
    sessionStability: {
      state: 'not_instrumented',
      reason: 'Not instrumented',
      data: null
    },
    counters: {
      messagesAllowed: 0,
      messagesBlocked: 0,
      totalDelayMs: 0
    },
    recentDelays: [],
    config: {
      state: 'enabled',
      preset: 'conservative',
      mutable: false,
      values: {
        perMinute: 5,
        perHour: 100,
        perDay: 800,
        minDelayMs: 2500,
        maxDelayMs: 7000,
        newChatDelayMs: 4000,
        warmupDays: 10,
        autoPauseAt: 'medium'
      }
    },
    capabilities: {
      health: { state: 'enabled', reason: null },
      reset: { state: 'disabled', reason: 'Disabled by config' }
    }
  } as const;
  const safetyCenterService = {
    getSnapshot: vi.fn(async () => safetySnapshot),
    getPrometheusMetrics: vi.fn(async () => 'control_panel_safety_available 1\n'),
    pause: vi.fn(async () => {
      whatsappService.pauseSending();
      return safetySnapshot;
    }),
    resume: vi.fn(async () => ({
      ...safetySnapshot,
      effectivePaused: false,
      manualPaused: false,
      mode: 'active',
      blockers: []
    })),
    reset: vi.fn(async () => safetySnapshot)
  } as unknown as SafetyCenterService;

  return {
    app: createApp({
      whatsappService,
      messageService,
      databaseHealthCheck: async () => true,
      adminAuthService,
      auditService,
      overviewService,
      readModelService,
      handoffService,
      outboxService,
      chatbotService,
      safetyCenterService,
      tenantContextService,
      aiChatbotService,
      knowledgeService,
      documentService,
      aiRagRuntimeService,
      aiOperationsService
    }),
    adminAuthService,
    auditService,
    whatsappService,
    readModelService,
    handoffService,
    outboxService,
    chatbotService,
    safetyCenterService,
    tenantContextService,
    aiChatbotService,
    knowledgeService,
    documentService,
    aiRagRuntimeService,
    aiOperationsService
  };
};

describe('Admin API authentication and safety boundary', () => {
  it('rejects a cross-origin browser mutation before authentication', async () => {
    const { app, adminAuthService } = createTestApp();

    const response = await request(app)
      .post('/api/admin/v1/auth/login')
      .set('Origin', 'https://attacker.example')
      .send({ username: 'admin', password: 'admin123' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    expect(adminAuthService.login).not.toHaveBeenCalled();
  });

  it('creates an opaque cookie session and returns the authenticated user', async () => {
    const { app, auditService } = createTestApp();
    const response = await request(app)
      .post('/api/admin/v1/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(200);

    expect(response.body.data).toMatchObject({
      username: 'admin',
      displayName: 'Local Admin',
      role: 'admin'
    });
    expect(response.body).not.toHaveProperty('sessionToken');
    expect(response.body.meta.requestId).toBe(response.headers['x-request-id']);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((cookie) =>
      cookie.startsWith('admin_session=session-token') &&
      cookie.includes('HttpOnly') &&
      cookie.includes('SameSite=Lax')
    )).toBe(true);
    expect(cookies.some((cookie) =>
      cookie.startsWith('admin_csrf=csrf-token') &&
      !cookie.includes('HttpOnly')
    )).toBe(true);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.login_succeeded' })
    );
  });

  it('rejects missing or expired sessions with a traceable response', async () => {
    const { app } = createTestApp({ authenticated: null });
    const response = await request(app).get('/api/admin/v1/me').expect(401);

    expect(response.body.error).toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
      requestId: response.headers['x-request-id']
    });
  });

  it('returns forbidden when the session lacks dashboard permission', async () => {
    const { app } = createTestApp({
      authenticated: { ...admin, role: 'viewer', permissions: [] }
    });
    const response = await request(app)
      .get('/api/admin/v1/overview')
      .set('Cookie', 'admin_session=session-token')
      .expect(403);

    expect(response.body.error).toMatchObject({
      code: 'PERMISSION_DENIED',
      details: { permission: 'dashboard.read' }
    });
  });

  it('rejects an authenticated mutation without a valid CSRF token', async () => {
    const { app, adminAuthService } = createTestApp();
    const response = await request(app)
      .post('/api/admin/v1/auth/logout')
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .expect(403);

    expect(response.body.error.code).toBe('CSRF_TOKEN_INVALID');
    expect(adminAuthService.revokeSession).not.toHaveBeenCalled();
  });

  it('returns overview health without converting unavailable metrics to zero', async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .get('/api/admin/v1/overview')
      .set('Cookie', 'admin_session=session-token')
      .expect(200);

    expect(response.body.data.readiness).toMatchObject({
      database: 'connected',
      readyToSend: false
    });
    expect(response.body.data.session.state).toBe('disconnected');
    expect(response.body.data.safety.score).toBeNull();
    expect(response.body.data.outbox).toBeNull();
    expect(response.body.meta.requestId).toBe(response.headers['x-request-id']);
  });

  it('exposes separate liveness and readiness probes with request IDs', async () => {
    const { app } = createTestApp();
    const live = await request(app).get('/health/live').expect(200);
    const ready = await request(app).get('/health/ready').expect(200);

    expect(live.body.status).toBe('live');
    expect(ready.body).toMatchObject({
      database: 'connected',
      whatsapp: 'disconnected'
    });
    expect(live.body.requestId).toBe(live.headers['x-request-id']);
    expect(ready.body.requestId).toBe(ready.headers['x-request-id']);
  });

  it('returns rich session detail and an ephemeral non-cacheable QR to operators', async () => {
    const { app } = createTestApp();
    const session = await request(app)
      .get('/api/admin/v1/session')
      .set('Cookie', 'admin_session=session-token')
      .expect(200);
    const qr = await request(app)
      .get('/api/admin/v1/session/qr')
      .set('Cookie', 'admin_session=session-token')
      .expect(200);

    expect(session.body.data.session).toMatchObject({
      state: 'disconnected',
      reconnect: { eligible: true },
      browser: { platform: 'Ubuntu' }
    });
    expect(qr.body.data.qr).toBe('raw-pairing-value');
    expect(qr.headers['cache-control']).toContain('no-store');
  });

  it('does not expose pairing QR or reconnect control to a viewer', async () => {
    const { app, whatsappService } = createTestApp({
      authenticated: {
        ...admin,
        role: 'viewer',
        permissions: ['dashboard.read']
      }
    });

    await request(app)
      .get('/api/admin/v1/session/qr')
      .set('Cookie', 'admin_session=session-token')
      .expect(403);
    await request(app)
      .post('/api/admin/v1/session/reconnect')
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .expect(403);
    await request(app)
      .post('/api/admin/v1/session/reset')
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .expect(403);

    expect(whatsappService.requestReconnect).not.toHaveBeenCalled();
    expect(whatsappService.resetCredentials).not.toHaveBeenCalled();
  });

  it('accepts a CSRF-protected reconnect and writes its audit event', async () => {
    const { app, auditService, whatsappService } = createTestApp();
    const response = await request(app)
      .post('/api/admin/v1/session/reconnect')
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .expect(202);

    expect(response.body.data.session.state).toBe('disconnected');
    expect(whatsappService.requestReconnect).toHaveBeenCalledOnce();
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'session.reconnect_requested' })
    );
  });

  it('explains why reconnect is disabled for an ineligible state', async () => {
    const { app } = createTestApp({
      reconnectError: new ReconnectNotAllowedError('already_connected')
    });
    const response = await request(app)
      .post('/api/admin/v1/session/reconnect')
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .expect(409);

    expect(response.body.error).toMatchObject({
      code: 'RECONNECT_NOT_ALLOWED',
      details: { reason: 'already_connected' }
    });
  });

  it('resets WhatsApp credentials in one click with audit', async () => {
    const {
      app,
      adminAuthService,
      auditService,
      whatsappService
    } = createTestApp();
    const response = await request(app)
      .post('/api/admin/v1/session/reset')
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .expect(202);

    expect(response.body.data.session.state).toBe('disconnected');
    expect(adminAuthService.verifyUserPassword).not.toHaveBeenCalled();
    expect(whatsappService.resetCredentials).toHaveBeenCalledOnce();
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'session.auth_reset_requested',
        reason: 'Admin requested WhatsApp credential reset'
      })
    );
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'session.auth_reset',
        reason: 'Admin requested WhatsApp credential reset'
      })
    );
  });

  it('still requires CSRF protection for one-click credential reset', async () => {
    const { app, whatsappService } = createTestApp();

    await request(app)
      .post('/api/admin/v1/session/reset')
      .set('Cookie', 'admin_session=session-token')
      .expect(403);

    expect(whatsappService.resetCredentials).not.toHaveBeenCalled();
  });

  it('immediately applies and audits an emergency pause', async () => {
    const { app, auditService, whatsappService } = createTestApp();
    const response = await request(app)
      .post('/api/admin/v1/safety/pause')
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .expect(200);

    expect(response.body.data.manualPaused).toBe(true);
    expect(whatsappService.pauseSending).toHaveBeenCalledOnce();
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'safety.pause' })
    );
  });

  it('returns structured safety state without representing disabled modules as zero', async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .get('/api/admin/v1/safety/stats')
      .set('Cookie', 'admin_session=session-token')
      .expect(200);

    expect(response.body.data).toMatchObject({
      effectivePaused: true,
      mode: 'manual_pause',
      retry: {
        state: 'disabled',
        data: null
      },
      sessionStability: {
        state: 'not_instrumented',
        data: null
      }
    });
    expect(response.body.data.blockers[0]).toMatchObject({
      code: 'MANUAL_PAUSE',
      message: expect.any(String),
      recommendation: expect.any(String)
    });
  });

  it('exports safety metrics using the same normalized scale', async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .get('/api/admin/v1/safety/metrics')
      .set('Cookie', 'admin_session=session-token')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('control_panel_safety_available 1');
  });

  it('prevents an operator from executing guarded recovery', async () => {
    const { app, safetyCenterService } = createTestApp({
      authenticated: {
        ...admin,
        role: 'operator',
        permissions: [
          'dashboard.read',
          'messages.read',
          'safety.pause'
        ]
      }
    });

    await request(app)
      .post('/api/admin/v1/safety/resume')
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .send({
        reason: 'Risk has been reviewed by the shift lead',
        acknowledgement: 'I_UNDERSTAND_THE_RISK',
        currentPassword: 'admin123'
      })
      .expect(403);

    expect(safetyCenterService.resume).not.toHaveBeenCalled();
  });

  it('requires acknowledgement and step-up authentication before resume', async () => {
    const { app, adminAuthService, safetyCenterService } = createTestApp();
    const endpoint = request(app)
      .post('/api/admin/v1/safety/resume')
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token');

    const missingAcknowledgement = await endpoint
      .send({
        reason: 'Risk has been reviewed by the shift lead',
        currentPassword: 'admin123'
      })
      .expect(400);
    expect(missingAcknowledgement.body.error.code).toBe(
      'SAFETY_ACKNOWLEDGEMENT_REQUIRED'
    );

    await request(app)
      .post('/api/admin/v1/safety/resume')
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .send({
        reason: 'Risk has been reviewed by the shift lead',
        acknowledgement: 'I_UNDERSTAND_THE_RISK',
        currentPassword: 'wrong-password'
      })
      .expect(403);

    expect(adminAuthService.verifyUserPassword).toHaveBeenCalled();
    expect(safetyCenterService.resume).not.toHaveBeenCalled();
  });

  it('executes and audits an admin resume after every guard passes', async () => {
    const { app, auditService, safetyCenterService } = createTestApp();
    const response = await request(app)
      .post('/api/admin/v1/safety/resume')
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .send({
        reason: 'Risk has been reviewed and sending may continue',
        acknowledgement: 'I_UNDERSTAND_THE_RISK',
        currentPassword: 'admin123'
      })
      .expect(200);

    expect(response.body.data).toMatchObject({
      effectivePaused: false,
      manualPaused: false,
      mode: 'active'
    });
    expect(safetyCenterService.resume).toHaveBeenCalledWith({
      actorUserId: admin.id,
      reason: 'Risk has been reviewed and sending may continue'
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'safety.resume' })
    );
  });

  it('requires typed confirmation before attempting a safety reset', async () => {
    const { app, safetyCenterService } = createTestApp();
    const response = await request(app)
      .post('/api/admin/v1/safety/reset')
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .send({
        reason: 'Approved maintenance reset after incident review',
        confirmation: 'RESET',
        currentPassword: 'admin123'
      })
      .expect(400);

    expect(response.body.error.code).toBe(
      'SAFETY_RESET_CONFIRMATION_REQUIRED'
    );
    expect(safetyCenterService.reset).not.toHaveBeenCalled();
  });

  it('searches conversations and returns cursor metadata without exposing full phone', async () => {
    const { app, readModelService } = createTestApp();
    const response = await request(app)
      .get('/api/admin/v1/conversations?query=Rina&limit=20')
      .set('Cookie', 'admin_session=session-token')
      .expect(200);

    expect(response.body.data[0]).toMatchObject({
      id: '42',
      displayName: 'Rina',
      maskedPhone: '6281***890'
    });
    expect(response.body.data[0]).not.toHaveProperty('phoneNumber');
    expect(response.body.meta.nextCursor).toBe('next-conversation-cursor');
    expect(readModelService.listConversations).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'Rina', limit: 20 })
    );
  });

  it('opens the correct deep-linked thread and returns its message history', async () => {
    const { app, readModelService } = createTestApp();
    const response = await request(app)
      .get('/api/admin/v1/conversations/42/messages')
      .set('Cookie', 'admin_session=session-token')
      .expect(200);

    expect(response.body.data[0]).toMatchObject({
      id: '9',
      content: 'Halo',
      direction: 'incoming'
    });
    expect(readModelService.listMessages).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: '42' })
    );
  });

  it('rejects invalid cursors before running a database query', async () => {
    const { app, readModelService } = createTestApp();
    const response = await request(app)
      .get('/api/admin/v1/conversations?cursor=not-a-cursor')
      .set('Cookie', 'admin_session=session-token')
      .expect(400);

    expect(response.body.error.code).toBe('INVALID_CURSOR');
    expect(readModelService.listConversations).not.toHaveBeenCalled();
  });

  it('requires message permission for conversation search', async () => {
    const { app } = createTestApp({
      authenticated: {
        ...admin,
        role: 'viewer',
        permissions: ['dashboard.read', 'contacts.read']
      }
    });

    await request(app)
      .get('/api/admin/v1/conversations')
      .set('Cookie', 'admin_session=session-token')
      .expect(403);
  });

  it('lists follow-ups and audits a CSRF-protected claim', async () => {
    const { app, auditService, handoffService } = createTestApp();
    const list = await request(app)
      .get('/api/admin/v1/handoffs?state=open')
      .set('Cookie', 'admin_session=session-token')
      .expect(200);

    expect(list.body.data[0]).toMatchObject({
      id: openHandoff.id,
      state: 'open',
      sourcePreview: '5'
    });

    const claim = await request(app)
      .post(`/api/admin/v1/handoffs/${openHandoff.id}/assign`)
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .send({})
      .expect(200);

    expect(claim.body.data).toMatchObject({
      state: 'assigned',
      assigneeUserId: admin.id
    });
    expect(handoffService.assign).toHaveBeenCalledWith(
      openHandoff.id,
      admin.id
    );
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'handoff.assign' })
    );
  });

  it('requires a resolution note and audits a valid resolve', async () => {
    const { app, auditService, handoffService } = createTestApp();

    await request(app)
      .post(`/api/admin/v1/handoffs/${openHandoff.id}/resolve`)
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .send({ resolutionNote: ' ' })
      .expect(400);

    const response = await request(app)
      .post(`/api/admin/v1/handoffs/${openHandoff.id}/resolve`)
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .send({ resolutionNote: 'Sudah dihubungi operator.' })
      .expect(200);

    expect(response.body.data).toMatchObject({
      state: 'resolved',
      resolutionNote: 'Sudah dihubungi operator.'
    });
    expect(handoffService.resolve).toHaveBeenCalledWith(
      openHandoff.id,
      'Sudah dihubungi operator.'
    );
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'handoff.resolve' })
    );
  });

  it('returns AI handoff detail and supports in-progress and close transitions', async () => {
    const { app, handoffService, auditService } = createTestApp();
    const detail = await request(app)
      .get(`/api/admin/v1/handoffs/${openHandoff.id}`)
      .set('Cookie', 'admin_session=session-token')
      .expect(200);
    expect(detail.headers['cache-control']).toBe('no-store');
    expect(detail.body.data).toMatchObject({
      reason: 'customer_interested', summary: 'Customer meminta langkah berikutnya.',
      safetyCategory: 'normal_faq', traceId: 'trace_sprint_5'
    });

    await request(app)
      .post(`/api/admin/v1/handoffs/${openHandoff.id}/in-progress`)
      .set('Cookie', ['admin_session=session-token', 'admin_csrf=csrf-token'])
      .set('X-CSRF-Token', 'csrf-token').send({}).expect(200);
    expect(handoffService.markInProgress).toHaveBeenCalledWith(openHandoff.id, admin.id);

    await request(app)
      .post(`/api/admin/v1/handoffs/${openHandoff.id}/close`)
      .set('Cookie', ['admin_session=session-token', 'admin_csrf=csrf-token'])
      .set('X-CSRF-Token', 'csrf-token')
      .send({ resolutionNote: 'Tindak lanjut selesai.' }).expect(200);
    expect(handoffService.close).toHaveBeenCalledWith(openHandoff.id, 'Tindak lanjut selesai.');
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'handoff.close' }));
  });

  it('scopes the AI handoff alias to the server-derived tenant', async () => {
    const { app, handoffService } = createTestApp();
    await request(app)
      .get('/api/admin/v1/ai-chatbot/handoffs?state=open')
      .set('Cookie', 'admin_session=session-token')
      .expect(200);
    expect(handoffService.list).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: '00000000-0000-4000-8000-000000000001'
    }));

    await request(app)
      .post(`/api/admin/v1/ai-chatbot/handoffs/${openHandoff.id}/assign`)
      .set('Cookie', ['admin_session=session-token', 'admin_csrf=csrf-token'])
      .set('X-CSRF-Token', 'csrf-token').send({}).expect(200);
    expect(handoffService.assign).toHaveBeenCalledWith(
      openHandoff.id, admin.id, '00000000-0000-4000-8000-000000000001'
    );
  });

  it('accepts an idempotent control-panel message into the outbox', async () => {
    const { app, outboxService } = createTestApp();
    const response = await request(app)
      .post('/api/admin/v1/messages')
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .set('Idempotency-Key', 'sprint-4-idempotency-key')
      .send({
        recipient: { contactId: '42' },
        message: { type: 'text', text: 'Halo dari control panel' },
        priority: 'normal'
      })
      .expect(202);

    expect(response.body.data).toEqual({
      id: logicalMessageId,
      outboxId,
      state: 'accepted'
    });
    expect(outboxService.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: admin.id,
        idempotencyKey: 'sprint-4-idempotency-key',
        text: 'Halo dari control panel'
      })
    );
  });

  it('rejects compose without an idempotency key', async () => {
    const { app, outboxService } = createTestApp();
    const response = await request(app)
      .post('/api/admin/v1/messages')
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .send({
        recipient: { contactId: '42' },
        message: { type: 'text', text: 'Halo' }
      })
      .expect(400);

    expect(response.body.error.code).toBe('INVALID_IDEMPOTENCY_KEY');
    expect(outboxService.createMessage).not.toHaveBeenCalled();
  });

  it('guards and audits outbox cancellation', async () => {
    const { app, outboxService, auditService } = createTestApp();
    const response = await request(app)
      .post(`/api/admin/v1/outbox/${outboxId}/cancel`)
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .expect(200);

    expect(response.body.data.state).toBe('canceled');
    expect(outboxService.cancel).toHaveBeenCalledWith(outboxId);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'outbox.cancel' })
    );
  });

  it('allows an Admin to reconcile unknown outcome with an audited note', async () => {
    const { app, outboxService, auditService } = createTestApp();
    const response = await request(app)
      .post(`/api/admin/v1/outbox/${outboxId}/reconcile`)
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .send({
        resolution: 'confirmed_not_sent',
        note: 'Verified against linked device history.'
      })
      .expect(200);

    expect(response.body.data.state).toBe('failed');
    expect(outboxService.reconcileUnknown).toHaveBeenCalledWith(
      outboxId,
      'confirmed_not_sent',
      null
    );
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'outbox.reconcile',
        reason: 'Verified against linked device history.'
      })
    );
  });

  it('lets an Admin read the active config and preview unsaved rules', async () => {
    const { app, chatbotService } = createTestApp();
    const config = await request(app)
      .get('/api/admin/v1/chatbot/config')
      .set('Cookie', 'admin_session=session-token')
      .expect(200);

    expect(config.body.data).toMatchObject({
      revision: 3,
      updatedAt: '2026-07-30T03:00:00.000Z'
    });

    const preview = await request(app)
      .post('/api/admin/v1/chatbot/test')
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .send({ input: '  MENU  ', rules: candidateChatbotRules })
      .expect(200);

    expect(preview.body.data).toMatchObject({
      normalizedInput: 'menu',
      response: 'Fallback'
    });
    expect(chatbotService.preview).toHaveBeenCalledWith(
      '  MENU  ',
      candidateChatbotRules
    );
  });

  it('exposes the fail-closed AI chatbot foundation to an authorized Admin', async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .get('/api/admin/v1/ai-chatbot/foundation')
      .set('Cookie', 'admin_session=session-token')
      .expect(200);

    expect(response.body).toMatchObject({
      data: {
        phase: 'sprint_6',
        status: 'development_ready',
        runtime: {
          enabled: false,
          customerTraffic: 'disabled',
          strictGrounding: true
        },
        guardrails: {
          booking: false,
          payments: false,
          diagnosis: false
        }
      },
      meta: {
        requestId: expect.any(String),
        generatedAt: expect.any(String)
      }
    });
    expect(response.body.data.modules).toHaveLength(9);
    expect(response.body.data.provider).not.toHaveProperty('secretReference');
    expect(response.body.data.provider).not.toHaveProperty(
      'providerSecretReference'
    );
  });

  it('keeps the AI chatbot foundation behind the temporary manage permission', async () => {
    const { app } = createTestApp({
      authenticated: {
        ...admin,
        role: 'viewer',
        permissions: ['dashboard.read']
      }
    });

    const response = await request(app)
      .get('/api/admin/v1/ai-chatbot/foundation')
      .set('Cookie', 'admin_session=session-token')
      .expect(403);

    expect(response.body.error).toMatchObject({
      code: 'TENANT_PERMISSION_DENIED',
      details: { permission: 'ai.settings.read' }
    });
  });

  it('returns tenant-scoped redacted AI integration settings and readiness', async () => {
    const { app, aiChatbotService } = createTestApp();
    const response = await request(app)
      .get('/api/admin/v1/ai-chatbot/integration')
      .set('Cookie', 'admin_session=session-token')
      .expect(200);

    expect(response.body.data).toMatchObject({
      integration: {
        tenantId: aiIntegration.tenantId,
        secretReferenceConfigured: true,
        effectiveEnabled: false
      },
      readiness: {
        effectiveEnabled: false,
        blockers: expect.arrayContaining([
          expect.objectContaining({ code: 'GLOBAL_RUNTIME_HARD_OFF' })
        ])
      }
    });
    expect(JSON.stringify(response.body)).not.toContain('AI_CHATBOT_MOCK_KEY');
    expect(aiChatbotService.getIntegration).toHaveBeenCalledWith(
      aiIntegration.tenantId
    );
  });

  it('requires CSRF before changing AI integration settings', async () => {
    const { app, aiChatbotService } = createTestApp();
    await request(app)
      .put('/api/admin/v1/ai-chatbot/integration')
      .set('Cookie', 'admin_session=session-token')
      .send(aiIntegrationUpdateInput)
      .expect(403);

    expect(aiChatbotService.updateIntegration).not.toHaveBeenCalled();
  });

  it('ignores a client tenant override and keeps secret references out of audit state', async () => {
    const { app, aiChatbotService, auditService } = createTestApp();
    const response = await request(app)
      .put('/api/admin/v1/ai-chatbot/integration')
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .send({
        ...aiIntegrationUpdateInput,
        tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      })
      .expect(200);

    expect(response.body.data.integration.revision).toBe(2);
    expect(aiChatbotService.updateIntegration).toHaveBeenCalledWith(
      aiIntegration.tenantId,
      expect.objectContaining({ expectedRevision: 1, provider: 'mock' })
    );
    expect(JSON.stringify(vi.mocked(auditService.record).mock.calls)).not.toContain(
      'env://AI_CHATBOT_MOCK_KEY'
    );
  });

  it('persists draft, approval, and publication through guarded prompt routes', async () => {
    const { app, aiChatbotService } = createTestApp();
    const authenticatedMutation = () =>
      request(app)
        .post('/api/admin/v1/ai-chatbot/prompts')
        .set('Cookie', [
          'admin_session=session-token',
          'admin_csrf=csrf-token'
        ])
        .set('X-CSRF-Token', 'csrf-token');

    await authenticatedMutation()
      .send({
        name: aiPrompt.name,
        primaryLanguage: aiPrompt.primaryLanguage,
        tone: aiPrompt.tone,
        systemInstruction: aiPrompt.systemInstruction,
        fallbackMessage: aiPrompt.fallbackMessage,
        handoffMessage: aiPrompt.handoffMessage,
        disclaimerText: null,
        maxAnswerLength: aiPrompt.maxAnswerLength
      })
      .expect(201);

    await request(app)
      .post(`/api/admin/v1/ai-chatbot/prompts/${aiPrompt.id}/approve`)
      .set('Cookie', ['admin_session=session-token', 'admin_csrf=csrf-token'])
      .set('X-CSRF-Token', 'csrf-token')
      .send({ expectedVersion: 1, changeReason: 'Reviewed for Sprint 1' })
      .expect(200);

    await request(app)
      .post(`/api/admin/v1/ai-chatbot/prompts/${aiPrompt.id}/publish`)
      .set('Cookie', ['admin_session=session-token', 'admin_csrf=csrf-token'])
      .set('X-CSRF-Token', 'csrf-token')
      .send({ expectedVersion: 1, changeReason: 'Approved for internal use' })
      .expect(200);

    expect(aiChatbotService.createPrompt).toHaveBeenCalledWith(
      aiIntegration.tenantId,
      admin.id,
      expect.objectContaining({ name: aiPrompt.name })
    );
    expect(aiChatbotService.approvePrompt).toHaveBeenCalledOnce();
    expect(aiChatbotService.publishPrompt).toHaveBeenCalledOnce();
  });

  it('returns explicit blockers when activation is attempted', async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .post('/api/admin/v1/ai-chatbot/integration/activate')
      .set('Cookie', ['admin_session=session-token', 'admin_csrf=csrf-token'])
      .set('X-CSRF-Token', 'csrf-token')
      .send({
        expectedRevision: 1,
        acknowledgement: 'ACTIVATE_STRICT_GROUNDED_AI'
      })
      .expect(409);

    expect(response.body.error).toMatchObject({
      code: 'AI_ACTIVATION_BLOCKED',
      details: {
        blockers: expect.arrayContaining([
          expect.objectContaining({ code: 'GLOBAL_RUNTIME_HARD_OFF' })
        ])
      }
    });
  });

  it('lists Sprint 2 categories and knowledge inside the resolved tenant', async () => {
    const { app, knowledgeService } = createTestApp();
    const categories = await request(app)
      .get('/api/admin/v1/ai-chatbot/categories')
      .set('Cookie', 'admin_session=session-token')
      .expect(200);
    const knowledge = await request(app)
      .get('/api/admin/v1/ai-chatbot/knowledge?status=draft&limit=20')
      .set('Cookie', 'admin_session=session-token')
      .expect(200);

    expect(categories.body.data[0].slug).toBe(knowledgeCategory.slug);
    expect(knowledge.body.data[0].title).toBe(knowledgeItem.title);
    expect(knowledgeService.listCategories).toHaveBeenCalledWith(aiIntegration.tenantId);
    expect(knowledgeService.listKnowledge).toHaveBeenCalledWith(
      aiIntegration.tenantId,
      expect.objectContaining({ status: 'draft', limit: 20 })
    );
  });

  it('creates and submits knowledge without trusting a body tenant override', async () => {
    const { app, knowledgeService, auditService } = createTestApp();
    await request(app)
      .post('/api/admin/v1/ai-chatbot/knowledge')
      .set('Cookie', ['admin_session=session-token', 'admin_csrf=csrf-token'])
      .set('X-CSRF-Token', 'csrf-token')
      .send({
        ...knowledgeWriteInput,
        tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      })
      .expect(201);

    await request(app)
      .post(`/api/admin/v1/ai-chatbot/knowledge/${knowledgeItem.id}/submit-review`)
      .set('Cookie', ['admin_session=session-token', 'admin_csrf=csrf-token'])
      .set('X-CSRF-Token', 'csrf-token')
      .send({ expectedVersion: 1, expectedRevision: 1, reason: 'Ready for review' })
      .expect(200);

    expect(knowledgeService.createKnowledge).toHaveBeenCalledWith(
      aiIntegration.tenantId,
      admin.id,
      expect.objectContaining({ title: knowledgeItem.title })
    );
    expect(knowledgeService.transitionKnowledge).toHaveBeenCalledWith(
      aiIntegration.tenantId,
      knowledgeItem.id,
      admin.id,
      1,
      1,
      'submit_review',
      'Ready for review'
    );
    expect(JSON.stringify(vi.mocked(auditService.record).mock.calls)).not.toContain(
      knowledgeItem.content
    );
  });

  it('requires CSRF and granular publish permission for knowledge mutations', async () => {
    const readOnlyAdmin = {
      ...admin,
      permissions: ['dashboard.read', 'messages.read'] as AuthenticatedAdmin['permissions']
    };
    const tenantContextService = {
      resolveForAdmin: vi.fn(async () => ({
        tenantId: aiIntegration.tenantId,
        slug: 'raho',
        name: 'RAHO',
        permissions: ['knowledge.read']
      }))
    } as unknown as TenantContextService;
    const { app, knowledgeService } = createTestApp({
      authenticated: readOnlyAdmin,
      tenantContextService
    });

    await request(app)
      .post('/api/admin/v1/ai-chatbot/knowledge')
      .set('Cookie', 'admin_session=session-token')
      .send(knowledgeWriteInput)
      .expect(403);

    const response = await request(app)
      .post(`/api/admin/v1/ai-chatbot/knowledge/${knowledgeItem.id}/publish`)
      .set('Cookie', ['admin_session=session-token', 'admin_csrf=csrf-token'])
      .set('X-CSRF-Token', 'csrf-token')
      .send({ expectedVersion: 1, expectedRevision: 1, reason: 'Approved release' })
      .expect(403);

    expect(response.body.error).toMatchObject({
      code: 'TENANT_PERMISSION_DENIED',
      details: { permission: 'knowledge.publish' }
    });
    expect(knowledgeService.createKnowledge).not.toHaveBeenCalled();
    expect(knowledgeService.transitionKnowledge).not.toHaveBeenCalled();
  });

  it('uploads and queues a Sprint 3 document inside the server-derived tenant', async () => {
    const { app, documentService, auditService } = createTestApp();
    const mutation = request(app)
      .post('/api/admin/v1/ai-chatbot/documents/upload')
      .set('Cookie', ['admin_session=session-token', 'admin_csrf=csrf-token'])
      .set('X-CSRF-Token', 'csrf-token')
      .field('categoryId', knowledgeCategory.id)
      .field('tenantId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      .attach('file', Buffer.from('Informasi resmi RAHO untuk pelanggan.'), {
        filename: 'panduan.txt', contentType: 'text/plain'
      });
    const uploaded = await mutation.expect(201);

    expect(uploaded.body.data.id).toBe(knowledgeDocument.id);
    expect(documentService.upload).toHaveBeenCalledWith(
      aiIntegration.tenantId,
      admin.id,
      knowledgeCategory.id,
      expect.objectContaining({ originalname: 'panduan.txt' })
    );
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ai.document_uploaded',
      afterState: expect.not.objectContaining({ objectKey: expect.anything() })
    }));

    const queued = await request(app)
      .post(`/api/admin/v1/ai-chatbot/documents/${knowledgeDocument.id}/process`)
      .set('Cookie', ['admin_session=session-token', 'admin_csrf=csrf-token'])
      .set('X-CSRF-Token', 'csrf-token')
      .expect(202);
    expect(queued.body.data.status).toBe('queued');
    expect(documentService.enqueueDocument).toHaveBeenCalledWith(
      aiIntegration.tenantId,
      knowledgeDocument.id,
      expect.any(String),
      false
    );
  });

  it('lists document processing state and returns a no-store extraction preview', async () => {
    const { app, documentService } = createTestApp();
    const listed = await request(app)
      .get('/api/admin/v1/ai-chatbot/documents?status=uploaded')
      .set('Cookie', 'admin_session=session-token')
      .expect(200);
    expect(listed.body.data[0].filename).toBe('panduan.txt');
    expect(documentService.list).toHaveBeenCalledWith(aiIntegration.tenantId, {
      limit: 20, offset: 0, status: 'uploaded'
    });

    const preview = await request(app)
      .get(`/api/admin/v1/ai-chatbot/documents/${knowledgeDocument.id}/preview`)
      .set('Cookie', 'admin_session=session-token')
      .expect(200);
    expect(preview.headers['cache-control']).toBe('no-store');
    expect(preview.body.data.extractionPreview).toContain('Informasi resmi');
  });

  it('requires CSRF and knowledge.edit for document upload and processing', async () => {
    const readOnlyAdmin = {
      ...admin,
      permissions: ['dashboard.read', 'messages.read'] as AuthenticatedAdmin['permissions']
    };
    const tenantContextService = {
      resolveForAdmin: vi.fn(async () => ({
        tenantId: aiIntegration.tenantId,
        slug: 'raho',
        name: 'RAHO',
        permissions: ['knowledge.read']
      }))
    } as unknown as TenantContextService;
    const { app, documentService } = createTestApp({
      authenticated: readOnlyAdmin,
      tenantContextService
    });

    await request(app)
      .post(`/api/admin/v1/ai-chatbot/documents/${knowledgeDocument.id}/process`)
      .set('Cookie', 'admin_session=session-token')
      .expect(403);

    const denied = await request(app)
      .post(`/api/admin/v1/ai-chatbot/documents/${knowledgeDocument.id}/process`)
      .set('Cookie', ['admin_session=session-token', 'admin_csrf=csrf-token'])
      .set('X-CSRF-Token', 'csrf-token')
      .expect(403);
    expect(denied.body.error).toMatchObject({
      code: 'TENANT_PERMISSION_DENIED',
      details: { permission: 'knowledge.edit' }
    });
    expect(documentService.enqueueDocument).not.toHaveBeenCalled();
  });

  it('runs the Sprint 4 Alpha Playground with server tenant and redacted audit metadata', async () => {
    const { app, aiRagRuntimeService, auditService } = createTestApp();
    const response = await request(app)
      .post('/api/admin/v1/ai-chatbot/playground/test')
      .set('Cookie', ['admin_session=session-token', 'admin_csrf=csrf-token'])
      .set('X-CSRF-Token', 'csrf-token')
      .send({ message: 'Apa itu RAHO?', tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toMatchObject({
      answerStatus: 'supported',
      traceId: 'af924761-829f-41b3-ac80-01163852cb76'
    });
    expect(aiRagRuntimeService.respond).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: aiIntegration.tenantId,
      channel: 'playground',
      requireActiveIntegration: false
    }));
    expect(JSON.stringify(vi.mocked(auditService.record).mock.calls)).not.toContain('Apa itu RAHO?');
    expect(JSON.stringify(vi.mocked(auditService.record).mock.calls)).not.toContain('Jawaban grounded');
  });

  it('exposes tenant-scoped Sprint 6 logs and saves audited reviewer feedback', async () => {
    const { app, aiOperationsService, auditService } = createTestApp();
    const logs = await request(app)
      .get('/api/admin/v1/ai-chatbot/conversations?unanswered=true')
      .set('Cookie', 'admin_session=session-token')
      .expect(200);
    expect(logs.headers['cache-control']).toBe('no-store');
    expect(logs.body.data[0]).toMatchObject({ channel: 'playground', traceCount: 1 });
    expect(aiOperationsService.listConversations).toHaveBeenCalledWith(
      aiIntegration.tenantId, expect.objectContaining({ unanswered: true })
    );

    const traceId = 'af924761-829f-41b3-ac80-01163852cb76';
    await request(app)
      .post(`/api/admin/v1/ai-chatbot/messages/${traceId}/feedback`)
      .set('Cookie', ['admin_session=session-token', 'admin_csrf=csrf-token'])
      .set('X-CSRF-Token', 'csrf-token')
      .send({ type: 'correct', comment: 'Grounded.', correctKnowledgeIds: [] })
      .expect(200);
    expect(aiOperationsService.saveFeedback).toHaveBeenCalledWith(
      aiIntegration.tenantId, traceId, admin.id, expect.objectContaining({ type: 'correct' })
    );
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ai.message_feedback_saved' }));
  });

  it('rejects invalid Sprint 6 conversation status and date filters before querying storage', async () => {
    const { app, aiOperationsService } = createTestApp();
    await request(app)
      .get('/api/admin/v1/ai-chatbot/conversations?answerStatus=made_up')
      .set('Cookie', 'admin_session=session-token')
      .expect(400);
    await request(app)
      .get('/api/admin/v1/ai-chatbot/conversations?from=not-a-date')
      .set('Cookie', 'admin_session=session-token')
      .expect(400);
    expect(aiOperationsService.listConversations).not.toHaveBeenCalled();
  });

  it('runs a Sprint 6 test-case batch behind evaluation permission and CSRF', async () => {
    const { app, aiOperationsService } = createTestApp();
    const response = await request(app)
      .post('/api/admin/v1/ai-chatbot/playground/test-cases/run-batch')
      .set('Cookie', ['admin_session=session-token', 'admin_csrf=csrf-token'])
      .set('X-CSRF-Token', 'csrf-token')
      .send({ testCaseIds: ['ea9f426f-17bd-47f7-a260-6017017fdd46'] })
      .expect(200);
    expect(response.body.data).toMatchObject({ total: 1, passed: 1, failed: 0, passRate: 1 });
    expect(aiOperationsService.runBatch).toHaveBeenCalledWith(
      aiIntegration.tenantId, admin.id, ['ea9f426f-17bd-47f7-a260-6017017fdd46']
    );
  });

  it('guards the service runtime with API key, alpha flag, and idempotency key', async () => {
    const previous = env.AI_CHATBOT_ALPHA_RUNTIME_ENABLED;
    env.AI_CHATBOT_ALPHA_RUNTIME_ENABLED = true;
    try {
      const { app, aiRagRuntimeService } = createTestApp();
      const payload = {
        channel: 'whatsapp', channelSessionId: 'wa-main',
        customerIdentifier: '628123456789@s.whatsapp.net',
        providerMessageId: 'provider-sprint-4', message: 'Apa itu RAHO?',
        timestamp: '2026-08-05T02:00:00.000Z'
      };
      await request(app)
        .post('/api/admin/v1/ai-chatbot/runtime/respond')
        .set('Idempotency-Key', payload.providerMessageId)
        .send(payload)
        .expect(401);
      await request(app)
        .post('/api/admin/v1/ai-chatbot/runtime/respond')
        .set('X-API-Key', env.API_KEY)
        .set('Idempotency-Key', 'different')
        .send(payload)
        .expect(409);
      await request(app)
        .post('/api/admin/v1/ai-chatbot/runtime/respond')
        .set('X-API-Key', env.API_KEY)
        .set('Idempotency-Key', payload.providerMessageId)
        .send(payload)
        .expect(200);
      expect(aiRagRuntimeService.respond).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: env.AI_CHATBOT_DEFAULT_TENANT_ID,
        channel: 'whatsapp',
        requireActiveIntegration: true
      }));
    } finally {
      env.AI_CHATBOT_ALPHA_RUNTIME_ENABLED = previous;
    }
  });

  it('rejects AI routes when server-side tenant membership cannot be resolved', async () => {
    const tenantContextService = {
      resolveForAdmin: vi.fn(async () => {
        throw new TenantContextResolutionError(
          'No active membership',
          'TENANT_CONTEXT_UNRESOLVED'
        );
      })
    } as unknown as TenantContextService;
    const { app } = createTestApp({ tenantContextService });

    const response = await request(app)
      .get('/api/admin/v1/ai-chatbot/integration')
      .set('Cookie', 'admin_session=session-token')
      .expect(403);

    expect(response.body.error.code).toBe('TENANT_CONTEXT_UNRESOLVED');
  });

  it.each(['viewer', 'operator'] as const)(
    'prevents a %s from updating the chatbot config',
    async (role) => {
      const { app, chatbotService } = createTestApp({
        authenticated: {
          ...admin,
          role,
          permissions: ['dashboard.read', 'messages.read']
        }
      });

      const response = await request(app)
        .put('/api/admin/v1/chatbot/config')
        .set('Cookie', [
          'admin_session=session-token',
          'admin_csrf=csrf-token'
        ])
        .set('X-CSRF-Token', 'csrf-token')
        .send({ expectedRevision: 3, rules: candidateChatbotRules })
        .expect(403);

      expect(response.body.error).toMatchObject({
        code: 'PERMISSION_DENIED',
        details: { permission: 'chatbot.manage' }
      });
      expect(chatbotService.updateConfig).not.toHaveBeenCalled();
    }
  );

  it('atomically updates and audits the active chatbot config', async () => {
    const { app, chatbotService, auditService } = createTestApp();
    const response = await request(app)
      .put('/api/admin/v1/chatbot/config')
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .send({
        expectedRevision: 3,
        rules: candidateChatbotRules
      })
      .expect(200);

    expect(response.body.data.revision).toBe(4);
    expect(chatbotService.updateConfig).toHaveBeenCalledWith({
      expectedRevision: 3,
      rules: candidateChatbotRules
    });
    expect(auditService.record).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        action: 'chatbot.config_update_requested',
        resourceType: 'chatbot_config',
        beforeState: {
          expectedRevision: 3,
          ruleCount: candidateChatbotRules.length
        }
      })
    );
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'chatbot.config_updated',
        resourceType: 'chatbot_config',
        resourceId: activeChatbotVersionId,
        beforeState: expect.objectContaining({ revision: 3 }),
        afterState: expect.objectContaining({ revision: 4 })
      })
    );
  });

  it('removes the draft, publish, history, and rollback routes', async () => {
    const { app } = createTestApp();
    const cookie = 'admin_session=session-token';

    await request(app)
      .get('/api/admin/v1/chatbot/versions')
      .set('Cookie', cookie)
      .expect(404);
    await request(app)
      .post(`/api/admin/v1/chatbot/versions/${activeChatbotVersionId}/rollback`)
      .set('Cookie', cookie)
      .expect(404);
  });
});
