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
const draftChatbotVersionId = '820eff36-f95f-45e0-a993-d39a36b74452';
const chatbotRuleId = 'ec53bfd2-a990-4e1a-866c-45145ee96c93';

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
    verifyUserPassword: vi.fn(async (_userId: string, password: string) =>
      password === 'admin123'
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
  const chatbotDetail = {
    version: {
      id: draftChatbotVersionId,
      versionNumber: 2,
      name: 'Draft v2',
      status: 'draft' as const,
      changeSummary: null,
      basedOnVersionId: activeChatbotVersionId,
      revision: 0,
      contentHash: 'draft-hash',
      createdBy: admin.id,
      publishedBy: null,
      createdAt: '2026-07-30T03:00:00.000Z',
      updatedAt: '2026-07-30T03:00:00.000Z',
      publishedAt: null,
      ruleCount: 1
    },
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
    listVersions: vi.fn(async () => [chatbotDetail.version]),
    getVersion: vi.fn(async () => chatbotDetail),
    createDraft: vi.fn(async () => chatbotDetail),
    replaceDraftRules: vi.fn(async () => ({
      ...chatbotDetail,
      version: { ...chatbotDetail.version, revision: 1 }
    })),
    evaluate: vi.fn(async (input: string) => ({
      versionId: draftChatbotVersionId,
      versionNumber: 2,
      normalizedInput: input.trim().toLowerCase(),
      matchedRule: {
        id: chatbotRuleId,
        triggerType: 'fallback',
        priority: 1000,
        matchedTrigger: null,
        action: 'reply'
      },
      response: 'Fallback'
    })),
    publish: vi.fn(async () => ({
      ...chatbotDetail,
      version: { ...chatbotDetail.version, status: 'published' }
    })),
    rollback: vi.fn(async () => ({
      ...chatbotDetail,
      version: { ...chatbotDetail.version, status: 'published' }
    }))
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
      safetyCenterService
    }),
    adminAuthService,
    auditService,
    whatsappService,
    readModelService,
    handoffService,
    outboxService,
    chatbotService,
    safetyCenterService
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

  it('lets an Admin inspect versions and dry-run an exact normalized response', async () => {
    const { app, chatbotService } = createTestApp();
    const versions = await request(app)
      .get('/api/admin/v1/chatbot/versions')
      .set('Cookie', 'admin_session=session-token')
      .expect(200);

    expect(versions.body.data[0].id).toBe(draftChatbotVersionId);

    const preview = await request(app)
      .post('/api/admin/v1/chatbot/test')
      .set('Cookie', [
        'admin_session=session-token',
        'admin_csrf=csrf-token'
      ])
      .set('X-CSRF-Token', 'csrf-token')
      .send({ versionId: draftChatbotVersionId, input: '  MENU  ' })
      .expect(200);

    expect(preview.body.data).toMatchObject({
      versionId: draftChatbotVersionId,
      normalizedInput: 'menu',
      response: 'Fallback'
    });
    expect(chatbotService.evaluate).toHaveBeenCalledWith(
      '  MENU  ',
      draftChatbotVersionId
    );
  });

  it.each(['viewer', 'operator'] as const)(
    'prevents a %s from creating a chatbot draft',
    async (role) => {
      const { app, chatbotService } = createTestApp({
        authenticated: {
          ...admin,
          role,
          permissions: ['dashboard.read', 'messages.read']
        }
      });

      const response = await request(app)
        .post('/api/admin/v1/chatbot/versions/drafts')
        .set('Cookie', [
          'admin_session=session-token',
          'admin_csrf=csrf-token'
        ])
        .set('X-CSRF-Token', 'csrf-token')
        .send({ name: 'Unauthorized draft' })
        .expect(403);

      expect(response.body.error).toMatchObject({
        code: 'PERMISSION_DENIED',
        details: { permission: 'chatbot.manage' }
      });
      expect(chatbotService.createDraft).not.toHaveBeenCalled();
    }
  );

  it('requires publish confirmation and audits a confirmed publish', async () => {
    const { app, chatbotService, auditService } = createTestApp();
    const endpoint = `/api/admin/v1/chatbot/versions/${draftChatbotVersionId}/publish`;
    const agent = () =>
      request(app)
        .post(endpoint)
        .set('Cookie', [
          'admin_session=session-token',
          'admin_csrf=csrf-token'
        ])
        .set('X-CSRF-Token', 'csrf-token');

    const rejected = await agent()
      .send({
        expectedActiveVersionId: activeChatbotVersionId,
        changeSummary: 'Align menu locations and reservations',
        confirmation: 'publish'
      })
      .expect(400);
    expect(rejected.body.error.code).toBe(
      'CHATBOT_PUBLISH_CONFIRMATION_REQUIRED'
    );
    expect(chatbotService.publish).not.toHaveBeenCalled();

    await agent()
      .send({
        expectedActiveVersionId: activeChatbotVersionId,
        changeSummary: 'Align menu locations and reservations',
        confirmation: 'PUBLISH'
      })
      .expect(200);

    expect(chatbotService.publish).toHaveBeenCalledWith({
      versionId: draftChatbotVersionId,
      actorUserId: admin.id,
      expectedActiveVersionId: activeChatbotVersionId,
      changeSummary: 'Align menu locations and reservations'
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'chatbot.version_published',
        reason: 'Align menu locations and reservations'
      })
    );
  });
});
