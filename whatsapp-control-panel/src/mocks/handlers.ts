import { delay, http, HttpResponse } from 'msw';
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

const composeReplay = new Map<
  string,
  { payload: string; data: { id: string; outboxId: string; state: 'accepted' } }
>();

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
  http.get('*/api/admin/v1/handoffs', ({ request }) => {
    const state = new URL(request.url).searchParams.get('state') ?? 'open';
    const data =
      state === 'all'
        ? mockHandoffs
        : mockHandoffs.filter((handoff) => handoff.state === state);
    return HttpResponse.json({ data, meta: meta() });
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
  )
];
