import request from 'supertest';
import { createApp } from '../src/app.js';
import type { AuthenticatedAdmin, LoginResult } from '../src/auth/types.js';
import type { AdminAuthService } from '../src/services/admin-auth.service.js';
import type { AuditService } from '../src/services/audit.service.js';
import type { MessageService } from '../src/services/message.service.js';
import type { ReadModelService } from '../src/services/read-model.service.js';
import type { HandoffService } from '../src/services/handoff.service.js';
import type { OverviewService } from '../src/services/overview.service.js';
import {
  ReconnectNotAllowedError,
  type WhatsAppService
} from '../src/services/whatsapp.service.js';

const admin: AuthenticatedAdmin = {
  id: '2a99543d-80d5-47a0-92ef-a389ce1a3001',
  username: 'admin',
  displayName: 'Local Admin',
  role: 'admin',
  permissions: [
    'dashboard.read',
    'messages.send',
    'messages.read',
    'contacts.read',
    'handoffs.manage',
    'session.reconnect',
    'safety.pause'
  ],
  sessionId: 'c8d4e03a-1884-4ec6-85ae-c99a969f2483',
  csrfTokenHash: 'csrf-hash',
  expiresAt: new Date('2099-01-01T00:00:00.000Z')
};

const loginResult: LoginResult = {
  user: admin,
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
  createdAt: '2026-07-30T03:00:00.000Z',
  updatedAt: '2026-07-30T03:00:00.000Z',
  contact: {
    displayName: 'Rina',
    maskedPhone: '6281***890'
  },
  sourcePreview: '5'
};

const createTestApp = (options: {
  authenticated?: AuthenticatedAdmin | null;
  login?: LoginResult | null;
  pairingQr?: { qr: string; expiresAt: string } | null;
  reconnectError?: Error;
  contactExists?: boolean;
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
    revokeSession: vi.fn(async () => undefined)
  } as unknown as AdminAuthService;
  const auditService = {
    record: vi.fn(async () => undefined)
  } as unknown as AuditService;
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
    }))
  } as unknown as HandoffService;

  return {
    app: createApp({
      whatsappService,
      messageService,
      databaseHealthCheck: async () => true,
      adminAuthService,
      auditService,
      overviewService,
      readModelService,
      handoffService
    }),
    adminAuthService,
    auditService,
    whatsappService,
    readModelService,
    handoffService
  };
};

describe('Admin API authentication and safety boundary', () => {
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

    expect(whatsappService.requestReconnect).not.toHaveBeenCalled();
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
});
