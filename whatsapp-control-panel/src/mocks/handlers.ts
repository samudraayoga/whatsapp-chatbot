import { delay, http, HttpResponse } from 'msw';
import { getOverviewScenario } from './scenario';
import {
  mockContacts,
  mockConversations,
  mockHandoffs,
  mockMessages
} from './inbox-fixtures';

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
  http.post('*/api/admin/v1/safety/pause', () => {
    const overview = getOverviewScenario();
    return HttpResponse.json({
      data: {
        effectivePaused: true,
        manualPaused: true,
        snapshot: { ...overview.data.safety, paused: true },
        capabilities: overview.data.capabilities
      },
      meta: overview.meta
    });
  })
];
