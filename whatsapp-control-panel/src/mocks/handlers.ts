import { delay, http, HttpResponse } from 'msw';
import type { ChatbotRule, KnowledgeItem } from '../api/contracts';
import { normalizeChatbotTrigger } from '../chatbot/editor';
import { getOverviewScenario } from './scenario';
import {
  mockContacts,
  mockConversations,
  mockHandoffs,
  mockMessages
} from './inbox-fixtures';
import {
  mockMessageDetails,
  mockOutboxItems
} from './outbox-fixtures';
import { mockSafetyCenter } from './safety-fixtures';
import {
  mockChatbotConfig,
  mockChatbotMeta
} from './chatbot-fixtures';
import {
  mockAiChatbotFoundation,
  mockAiIntegration,
  mockAiPrompts,
  mockAiRagResult,
  mockKnowledge,
  mockKnowledgeCategories,
  mockKnowledgeDocuments
} from './ai-chatbot-fixtures';

const composeReplay = new Map<
  string,
  { payload: string; data: { id: string; outboxId: string; state: 'accepted' } }
>();

let activeMockChatbotConfig = structuredClone(mockChatbotConfig);

export const resetMockChatbotConfig = () => {
  activeMockChatbotConfig = structuredClone(mockChatbotConfig);
};

const meta = (nextCursor: string | null = null) => ({
  requestId: 'req_mock_sprint_3',
  generatedAt: new Date().toISOString(),
  nextCursor
});

const sessionPayload = () => {
  const overview = getOverviewScenario();
  return {
    data: {
      session: overview.data.session,
      readiness: overview.data.readiness
    },
    meta: overview.meta
  };
};

export const handlers = [
  http.get('*/api/admin/v1/me', () =>
    HttpResponse.json(
      {
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication is required',
          requestId: 'req_mock_unauthorized'
        }
      },
      { status: 401 }
    )
  ),
  http.post('*/api/admin/v1/auth/login', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.username !== 'admin' || body.password !== 'admin123') {
      return HttpResponse.json(
        {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid username or password',
            requestId: 'req_mock_login_failed'
          }
        },
        { status: 401 }
      );
    }

    return HttpResponse.json({
      data: {
        id: 'local-admin',
        username: 'admin',
        displayName: 'Local Admin',
        role: 'admin',
        permissions: [
          'dashboard.read',
          'contacts.read',
          'messages.read',
          'handoffs.manage'
        ]
      },
      meta: {
        requestId: 'req_mock_login',
        generatedAt: new Date().toISOString()
      }
    });
  }),
  http.get('*/api/admin/v1/overview', async () => {
    await delay(120);
    return HttpResponse.json(getOverviewScenario());
  }),
  http.get('*/api/admin/v1/safety/stats', () =>
    HttpResponse.json(structuredClone(mockSafetyCenter))
  ),
  http.post('*/api/admin/v1/safety/pause', () => {
    const result = structuredClone(mockSafetyCenter);
    result.data.manualPaused = true;
    result.data.mode = 'manual_pause';
    return HttpResponse.json(result);
  }),
  http.post('*/api/admin/v1/safety/resume', () => {
    const result = structuredClone(mockSafetyCenter);
    result.data.manualPaused = false;
    return HttpResponse.json(result);
  }),
  http.post('*/api/admin/v1/safety/reset', () =>
    HttpResponse.json(structuredClone(mockSafetyCenter))
  ),
  http.get('*/api/admin/v1/conversations', ({ request }) => {
    const url = new URL(request.url);
    const query = (url.searchParams.get('query') ?? '').toLowerCase();
    const status = url.searchParams.get('status') ?? 'all';
    const data = mockConversations.filter((conversation) => {
      const matchesQuery = `${conversation.displayName ?? ''} ${conversation.maskedPhone ?? ''}`
        .toLowerCase()
        .includes(query);
      const matchesStatus =
        status === 'all' ||
        (status === 'identity_warning' &&
          conversation.identityStatus !== 'resolved') ||
        (status === 'has_failure' &&
          conversation.lastOutgoingStatus === 'failed');
      return matchesQuery && matchesStatus;
    });
    return HttpResponse.json({ data, meta: meta() });
  }),
  http.get(
    '*/api/admin/v1/conversations/:conversationId/messages',
    ({ params }) =>
      HttpResponse.json({
        data: mockMessages[String(params.conversationId)] ?? [],
        meta: meta()
      })
  ),
  http.get('*/api/admin/v1/contacts', ({ request }) => {
    const query = (
      new URL(request.url).searchParams.get('query') ?? ''
    ).toLowerCase();
    const data = mockContacts.filter((contact) =>
      `${contact.displayName ?? ''} ${contact.maskedPhone ?? ''}`
        .toLowerCase()
        .includes(query)
    );
    return HttpResponse.json({ data, meta: meta() });
  }),
  http.get('*/api/admin/v1/contacts/:contactId', ({ params }) => {
    const contact = mockContacts.find(
      (candidate) => candidate.id === String(params.contactId)
    );
    return contact
      ? HttpResponse.json({ data: contact, meta: meta() })
      : HttpResponse.json(
          {
            error: {
              code: 'CONTACT_NOT_FOUND',
              message: 'Contact was not found',
              requestId: 'req_mock_not_found'
            }
          },
          { status: 404 }
        );
  }),
  http.get('*/api/admin/v1/ai-chatbot/handoffs', ({ request }) => {
    const state = new URL(request.url).searchParams.get('state') ?? 'open';
    const data = state === 'all' ? mockHandoffs : mockHandoffs.filter((handoff) => handoff.state === state);
    return HttpResponse.json({ data, meta: meta() });
  }),
  http.get('*/api/admin/v1/handoffs', ({ request }) => {
    const state = new URL(request.url).searchParams.get('state') ?? 'open';
    const data =
      state === 'all'
        ? mockHandoffs
        : mockHandoffs.filter((handoff) => handoff.state === state);
    return HttpResponse.json({ data, meta: meta() });
  }),
  http.get('*/api/admin/v1/handoffs/:handoffId', ({ params }) => {
    const handoff = mockHandoffs.find((candidate) => candidate.id === String(params.handoffId));
    return handoff ? HttpResponse.json({ data: handoff, meta: meta() })
      : HttpResponse.json({ error: { code: 'HANDOFF_NOT_FOUND', message: 'Not found', requestId: 'mock' } }, { status: 404 });
  }),
  http.post('*/api/admin/v1/handoffs/:handoffId/assign', ({ params }) => {
    const handoff = mockHandoffs.find(
      (candidate) => candidate.id === String(params.handoffId)
    );
    return HttpResponse.json({
      data: {
        ...handoff,
        state: 'assigned',
        assigneeUserId: 'local-admin',
        updatedAt: new Date().toISOString()
      },
      meta: meta()
    });
  }),
  http.post('*/api/admin/v1/handoffs/:handoffId/resolve', async ({ params, request }) => {
    const body = (await request.json()) as { resolutionNote?: string };
    const handoff = mockHandoffs.find(
      (candidate) => candidate.id === String(params.handoffId)
    );
    return HttpResponse.json({
      data: {
        ...handoff,
        state: 'resolved',
        resolutionNote: body.resolutionNote ?? '',
        resolvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      meta: meta()
    });
  }),
  http.post('*/api/admin/v1/handoffs/:handoffId/in-progress', ({ params }) => {
    const handoff = mockHandoffs.find((candidate) => candidate.id === String(params.handoffId));
    return HttpResponse.json({ data: { ...handoff, state: 'in_progress', updatedAt: new Date().toISOString() }, meta: meta() });
  }),
  http.post('*/api/admin/v1/handoffs/:handoffId/close', async ({ params, request }) => {
    const body = (await request.json()) as { resolutionNote?: string };
    const handoff = mockHandoffs.find((candidate) => candidate.id === String(params.handoffId));
    return HttpResponse.json({ data: { ...handoff, state: 'closed', resolutionNote: body.resolutionNote ?? '', resolvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, meta: meta() });
  }),
  http.post('*/api/admin/v1/messages', async ({ request }) => {
    const key = request.headers.get('Idempotency-Key') ?? '';
    const body = await request.json();
    const payload = JSON.stringify(body);
    const existing = composeReplay.get(key);
    if (existing && existing.payload !== payload) {
      return HttpResponse.json(
        {
          error: {
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Idempotency key conflict',
            requestId: 'req_mock_conflict'
          }
        },
        { status: 409 }
      );
    }
    if (existing) {
      return HttpResponse.json({ data: existing.data, meta: meta() }, { status: 202 });
    }
    const data = {
      id: '59942ce7-4f15-4a8b-9448-a98f39d70d10',
      outboxId: '2ddb725d-56c0-4708-8d81-1b868a3e8bd9',
      state: 'accepted' as const
    };
    composeReplay.set(key, { payload, data });
    return HttpResponse.json({ data, meta: meta() }, { status: 202 });
  }),
  http.get('*/api/admin/v1/outbox', ({ request }) => {
    const state = new URL(request.url).searchParams.get('state') ?? 'all';
    return HttpResponse.json({
      data:
        state === 'all'
          ? mockOutboxItems
          : mockOutboxItems.filter((item) => item.state === state),
      meta: meta()
    });
  }),
  http.get('*/api/admin/v1/messages/:messageId', ({ params }) => {
    const detail = mockMessageDetails[String(params.messageId)];
    return detail
      ? HttpResponse.json({ data: detail, meta: meta() })
      : HttpResponse.json(
          {
            error: {
              code: 'MESSAGE_NOT_FOUND',
              message: 'Message was not found',
              requestId: 'req_mock_not_found'
            }
          },
          { status: 404 }
        );
  }),
  http.post('*/api/admin/v1/outbox/:outboxId/cancel', ({ params }) => {
    const item = mockOutboxItems.find(
      (candidate) => candidate.id === String(params.outboxId)
    )!;
    return HttpResponse.json({
      data: { id: item.id, messageId: item.messageId, state: 'canceled' },
      meta: meta()
    });
  }),
  http.post('*/api/admin/v1/outbox/:outboxId/retry', ({ params }) => {
    const item = mockOutboxItems.find(
      (candidate) => candidate.id === String(params.outboxId)
    )!;
    return HttpResponse.json({
      data: { id: item.id, messageId: item.messageId, state: 'queued' },
      meta: meta()
    });
  }),
  http.post('*/api/admin/v1/outbox/:outboxId/reconcile', async ({ params, request }) => {
    const body = (await request.json()) as { resolution?: string };
    const item = mockOutboxItems.find(
      (candidate) => candidate.id === String(params.outboxId)
    )!;
    return HttpResponse.json({
      data: {
        id: item.id,
        messageId: item.messageId,
        state: body.resolution === 'confirmed_sent' ? 'completed' : 'failed'
      },
      meta: meta()
    });
  }),
  http.get('*/api/admin/v1/session', () => HttpResponse.json(sessionPayload())),
  http.get('*/api/admin/v1/session/qr', () =>
    HttpResponse.json({
      data: {
        qr: 'mock-pairing-value',
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      },
      meta: getOverviewScenario().meta
    })
  ),
  http.post('*/api/admin/v1/session/reconnect', () =>
    HttpResponse.json(sessionPayload(), { status: 202 })
  ),
  http.get('*/api/admin/v1/chatbot/config', () =>
    HttpResponse.json({
      data: structuredClone(activeMockChatbotConfig),
      meta: mockChatbotMeta()
    })
  ),
  http.get('*/api/admin/v1/ai-chatbot/foundation', () =>
    HttpResponse.json(structuredClone(mockAiChatbotFoundation))
  ),
  http.get('*/api/admin/v1/ai-chatbot/integration', () =>
    HttpResponse.json(structuredClone(mockAiIntegration))
  ),
  http.put('*/api/admin/v1/ai-chatbot/integration', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const response = structuredClone(mockAiIntegration);
    response.data.integration = {
      ...response.data.integration,
      ...body,
      provider: String(body.provider ?? response.data.integration.provider),
      chatModel: String(body.chatModel ?? response.data.integration.chatModel),
      embeddingProvider: String(
        body.embeddingProvider ?? response.data.integration.embeddingProvider
      ),
      embeddingModel: String(
        body.embeddingModel ?? response.data.integration.embeddingModel
      ),
      revision: Number(body.expectedRevision ?? 1) + 1,
      updatedAt: new Date().toISOString()
    };
    return HttpResponse.json(response);
  }),
  http.post('*/api/admin/v1/ai-chatbot/integration/test-connection', () =>
    HttpResponse.json({
      data: {
        chatProvider: 'reachable',
        embeddingProvider: 'reachable',
        testedAt: new Date().toISOString()
      },
      meta: mockAiIntegration.meta
    })
  ),
  http.post('*/api/admin/v1/ai-chatbot/integration/activate', () =>
    HttpResponse.json(
      {
        error: {
          code: 'AI_ACTIVATION_BLOCKED',
          message: 'Customer runtime is intentionally unavailable.',
          details: { blockers: mockAiIntegration.data.readiness.blockers },
          requestId: 'req_mock_ai_activation'
        }
      },
      { status: 409 }
    )
  ),
  http.post('*/api/admin/v1/ai-chatbot/playground/test', () =>
    HttpResponse.json(structuredClone(mockAiRagResult))
  ),
  http.get('*/api/admin/v1/ai-chatbot/playground/test-cases', () =>
    HttpResponse.json({ data: [], meta: meta() })
  ),
  http.get('*/api/admin/v1/ai-chatbot/conversations', () =>
    HttpResponse.json({ data: [], meta: meta() })
  ),
  http.get('*/api/admin/v1/ai-chatbot/unanswered', () =>
    HttpResponse.json({ data: [], meta: meta() })
  ),
  http.get('*/api/admin/v1/ai-chatbot/prompts', () =>
    HttpResponse.json(structuredClone(mockAiPrompts))
  ),
  http.post('*/api/admin/v1/ai-chatbot/prompts', () =>
    HttpResponse.json(
      {
        data: structuredClone(mockAiPrompts.data[0]),
        meta: mockAiPrompts.meta
      },
      { status: 201 }
    )
  ),
  http.post('*/api/admin/v1/ai-chatbot/prompts/:promptId/approve', () =>
    HttpResponse.json({
      data: {
        ...structuredClone(mockAiPrompts.data[0]),
        status: 'approved',
        approvedBy: '2a99543d-80d5-47a0-92ef-a389ce1a3001',
        approvedAt: new Date().toISOString()
      },
      meta: mockAiPrompts.meta
    })
  ),
  http.post('*/api/admin/v1/ai-chatbot/prompts/:promptId/publish', () =>
    HttpResponse.json({
      data: {
        ...structuredClone(mockAiPrompts.data[0]),
        status: 'published',
        publishedAt: new Date().toISOString()
      },
      meta: mockAiPrompts.meta
    })
  ),
  http.get('*/api/admin/v1/ai-chatbot/categories', () =>
    HttpResponse.json(structuredClone(mockKnowledgeCategories))
  ),
  http.post('*/api/admin/v1/ai-chatbot/categories', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      data: {
        ...structuredClone(mockKnowledgeCategories.data[0]),
        id: '50d691f4-9d89-4c57-b147-7525371a569b',
        ...body,
        revision: 1,
        knowledgeCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      meta: mockKnowledgeCategories.meta
    }, { status: 201 });
  }),
  http.put('*/api/admin/v1/ai-chatbot/categories/:categoryId', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      data: {
        ...structuredClone(mockKnowledgeCategories.data[0]),
        ...body,
        revision: Number(body.expectedRevision ?? 1) + 1,
        updatedAt: new Date().toISOString()
      },
      meta: mockKnowledgeCategories.meta
    });
  }),
  http.delete('*/api/admin/v1/ai-chatbot/categories/:categoryId', () =>
    new HttpResponse(null, { status: 204 })
  ),
  http.get('*/api/admin/v1/ai-chatbot/knowledge', () =>
    HttpResponse.json(structuredClone(mockKnowledge))
  ),
  http.get('*/api/admin/v1/ai-chatbot/knowledge/:knowledgeId', () =>
    HttpResponse.json({ data: structuredClone(mockKnowledge.data[0]), meta: mockKnowledge.meta })
  ),
  http.post('*/api/admin/v1/ai-chatbot/knowledge', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      data: {
        ...structuredClone(mockKnowledge.data[0]),
        id: '2964bcc1-a42a-4d82-82fa-845d562ab283',
        versionId: 'cb0ad6bf-50a2-4b1d-aa7c-eb8291799c60',
        ...body,
        categoryName: null,
        version: 1,
        revision: 1,
        status: 'draft',
        contentFingerprint: 'b'.repeat(64),
        expired: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      meta: mockKnowledge.meta
    }, { status: 201 });
  }),
  http.put('*/api/admin/v1/ai-chatbot/knowledge/:knowledgeId', async ({ request }) => {
    const body = (await request.json()) as { knowledge: Partial<KnowledgeItem>; expectedRevision: number };
    return HttpResponse.json({
      data: {
        ...structuredClone(mockKnowledge.data[0]),
        ...body.knowledge,
        revision: body.expectedRevision + 1,
        updatedAt: new Date().toISOString()
      },
      meta: mockKnowledge.meta
    });
  }),
  http.delete('*/api/admin/v1/ai-chatbot/knowledge/:knowledgeId', () =>
    new HttpResponse(null, { status: 204 })
  ),
  http.post('*/api/admin/v1/ai-chatbot/knowledge/bulk-action', async ({ request }) => {
    const body = (await request.json()) as { action: 'publish' | 'archive' };
    return HttpResponse.json({
      data: mockKnowledge.data.map((item) => ({ ...structuredClone(item), status: body.action === 'publish' ? 'published' : 'archived', revision: item.revision + 1 })),
      meta: mockKnowledge.meta
    });
  }),
  http.post('*/api/admin/v1/ai-chatbot/knowledge/:knowledgeId/:transition', ({ params }) => {
    const statusByTransition: Record<string, KnowledgeItem['status']> = {
      'submit-review': 'review', 'request-revision': 'draft', approve: 'approved', publish: 'published', archive: 'archived'
    };
    return HttpResponse.json({
      data: {
        ...structuredClone(mockKnowledge.data[0]),
        status: statusByTransition[String(params.transition)] ?? 'draft',
        revision: mockKnowledge.data[0]!.revision + 1,
        updatedAt: new Date().toISOString()
      },
      meta: mockKnowledge.meta
    });
  }),
  http.get('*/api/admin/v1/ai-chatbot/documents', () =>
    HttpResponse.json(structuredClone(mockKnowledgeDocuments))
  ),
  http.get('*/api/admin/v1/ai-chatbot/documents/:documentId/preview', () =>
    HttpResponse.json({
      data: {
        document: structuredClone(mockKnowledgeDocuments.data[0]),
        extractionPreview: 'Panduan layanan resmi RAHO untuk kebutuhan informasi umum.',
        chunks: [{
          id: '115c1792-2d09-4438-a214-d773231bb499', chunkIndex: 0,
          title: 'panduan-layanan.txt', section: null,
          content: 'Panduan layanan resmi RAHO untuk kebutuhan informasi umum.',
          tokenCount: 12, status: 'active', embeddingModel: 'mock-embed-v1',
          metadata: { sourceType: 'document' }
        }]
      },
      meta: mockKnowledgeDocuments.meta
    })
  ),
  http.post('*/api/admin/v1/ai-chatbot/documents/:documentId/:action', ({ params }) =>
    HttpResponse.json({
      data: {
        ...structuredClone(mockKnowledgeDocuments.data[0]),
        status: params.action === 'archive' ? 'archived' : 'queued',
        updatedAt: new Date().toISOString()
      },
      meta: mockKnowledgeDocuments.meta
    }, { status: params.action === 'archive' ? 200 : 202 })
  ),
  http.delete('*/api/admin/v1/ai-chatbot/documents/:documentId', () =>
    new HttpResponse(null, { status: 204 })
  ),
  http.post('*/api/admin/v1/ai-chatbot/knowledge/search-test', () =>
    HttpResponse.json({
      data: [{
        chunkId: '115c1792-2d09-4438-a214-d773231bb499',
        title: 'panduan-layanan.txt', section: null,
        content: 'Panduan layanan resmi RAHO untuk kebutuhan informasi umum.',
        score: 0.91, sourceType: 'document',
        documentId: '03d5c308-8124-4d65-b8ab-2ba94691de09',
        knowledgeVersionId: null
      }],
      meta: mockKnowledgeDocuments.meta
    })
  ),
  http.put('*/api/admin/v1/chatbot/config', async ({ request }) => {
    const body = (await request.json()) as {
      expectedRevision: number;
      rules: ChatbotRule[];
    };

    if (body.expectedRevision !== activeMockChatbotConfig.revision) {
      return HttpResponse.json(
        {
          error: {
            code: 'CHATBOT_CONFIG_CONFLICT',
            message: 'Chatbot configuration was updated by another Admin',
            requestId: 'req_mock_chatbot_conflict'
          }
        },
        { status: 409 }
      );
    }

    activeMockChatbotConfig = {
      revision: body.expectedRevision + 1,
      updatedAt: new Date().toISOString(),
      rules: body.rules.map((rule) => ({
        ...structuredClone(rule),
        id: rule.id ?? globalThis.crypto.randomUUID()
      }))
    };
    return HttpResponse.json({
      data: structuredClone(activeMockChatbotConfig),
      meta: mockChatbotMeta()
    });
  }),
  http.post('*/api/admin/v1/chatbot/test', async ({ request }) => {
    const body = (await request.json()) as {
      input: string;
      rules: ChatbotRule[];
    };
    const normalizedInput = normalizeChatbotTrigger(body.input);
    const enabledRules = body.rules
      .filter((rule) => rule.enabled)
      .sort((left, right) => left.priority - right.priority);
    const matchedRule =
      enabledRules.find((rule) => {
        if (rule.triggerType === 'empty') return normalizedInput.length === 0;
        if (rule.triggerType === 'fallback') return false;
        return rule.triggerValues.some(
          (value) => normalizeChatbotTrigger(value) === normalizedInput
        );
      }) ??
      enabledRules.find((rule) => rule.triggerType === 'fallback') ??
      null;

    return HttpResponse.json({
      data: {
        normalizedInput,
        matchedRule: matchedRule
          ? {
              ...(matchedRule.id ? { id: matchedRule.id } : {}),
              triggerType: matchedRule.triggerType,
              priority: matchedRule.priority,
              matchedTrigger:
                matchedRule.triggerValues.find(
                  (value) => normalizeChatbotTrigger(value) === normalizedInput
                ) ?? null,
              action: matchedRule.action
            }
          : null,
        response: matchedRule?.responseText ?? ''
      },
      meta: mockChatbotMeta()
    });
  })
];
