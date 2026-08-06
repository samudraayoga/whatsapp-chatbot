import { z } from 'zod';

export const connectionStateSchema = z.enum([
  'starting',
  'connecting',
  'qr_required',
  'connected',
  'reconnecting',
  'paused',
  'logged_out',
  'bad_session',
  'disconnected',
  'shutting_down'
]);

export const serviceStateSchema = z.enum(['connected', 'disconnected', 'unknown']);
const riskSchema = z.enum(['low', 'medium', 'high', 'critical', 'unknown']);
const capabilityStateSchema = z.enum([
  'enabled',
  'disabled',
  'not_instrumented',
  'unavailable'
]);
const permissionSchema = z.enum([
  'dashboard.read',
  'contacts.read',
  'messages.read',
  'messages.send',
  'messages.cancel',
  'handoffs.manage',
  'session.reconnect',
  'safety.pause',
  'safety.resume',
  'session.reset',
  'chatbot.manage',
  'audit.read',
  'users.manage'
]);

const rateWindowSchema = z.object({
  used: z.number().nonnegative(),
  limit: z.number().positive()
});

export const sessionSnapshotSchema = z.object({
  state: connectionStateSchema,
  connectedSince: z.string().datetime().nullable(),
  lastDisconnect: z
    .object({
      code: z.number().optional(),
      reason: z.string(),
      classification: z.enum([
        'recoverable',
        'logged_out',
        'bad_session',
        'fatal',
        'unknown'
      ]),
      occurredAt: z.string().datetime()
    })
    .nullable(),
  reconnect: z.object({
    attempt: z.number().int().nonnegative(),
    nextRetryAt: z.string().datetime().nullable(),
    eligible: z.boolean(),
    disabledReason: z.string().nullable()
  }),
  browser: z.object({
    platform: z.string(),
    name: z.string()
  }),
  credentialUpdatedAt: z.string().datetime().nullable()
});

export const readinessSchema = z.object({
  readyToSend: z.boolean(),
  blockers: z.array(z.string()),
  database: serviceStateSchema,
  eventStream: serviceStateSchema
});

const operationalEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  severity: z.enum(['info', 'warning', 'critical']),
  occurredAt: z.string().datetime(),
  data: z.record(z.string(), z.unknown())
});

export const overviewResponseSchema = z.object({
  data: z.object({
    readiness: readinessSchema,
    session: sessionSnapshotSchema,
    safety: z.object({
      risk: riskSchema,
      score: z.number().min(0).max(100).nullable(),
      paused: z.boolean(),
      reasons: z.array(z.string()),
      recommendation: z.string()
    }),
    rates: z.object({
      minute: rateWindowSchema.nullable(),
      hour: rateWindowSchema.nullable(),
      day: rateWindowSchema.nullable()
    }),
    warmup: z
      .object({
        day: z.number().int().positive(),
        totalDays: z.number().int().positive(),
        sentToday: z.number().int().nonnegative(),
        limitToday: z.number().int(),
        progressRatio: z.number().min(0).max(1)
      })
      .nullable(),
    outbox: z
      .object({
        queued: z.number().int().nonnegative(),
        retrying: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        oldestAgeMs: z.number().nonnegative()
      })
      .nullable(),
    followUp: z
      .object({
        open: z.number().int().nonnegative(),
        unassigned: z.number().int().nonnegative(),
        overdue: z.number().int().nonnegative()
      })
      .nullable(),
    capabilities: z.record(z.string(), capabilityStateSchema),
    recentEvents: z.array(operationalEventSchema)
  }),
  meta: z.object({
    requestId: z.string(),
    generatedAt: z.string().datetime()
  })
});

export const sessionResponseSchema = z.object({
  data: z.object({
    session: sessionSnapshotSchema,
    readiness: readinessSchema
  }),
  meta: z.object({
    requestId: z.string(),
    generatedAt: z.string().datetime()
  })
});

export const qrResponseSchema = z.object({
  data: z.object({
    qr: z.string().min(1),
    expiresAt: z.string().datetime()
  }),
  meta: z.object({
    requestId: z.string(),
    generatedAt: z.string().datetime()
  })
});

export const safetyResponseSchema = z.object({
  data: z.object({
    effectivePaused: z.boolean(),
    manualPaused: z.boolean(),
    snapshot: z.object({
      risk: riskSchema,
      score: z.number().min(0).max(100).nullable(),
      paused: z.boolean(),
      reasons: z.array(z.string()),
      recommendation: z.string()
    }),
    capabilities: z.record(z.string(), capabilityStateSchema)
  }),
  meta: z.object({
    requestId: z.string(),
    generatedAt: z.string().datetime()
  })
});

const featureCapabilitySchema = z.object({
  state: capabilityStateSchema,
  reason: z.string().nullable()
});

const safetyRateWindowSchema = rateWindowSchema.extend({
  utilization: z.number().min(0).max(1)
});

export const safetyCenterResponseSchema = z.object({
  data: z.object({
    effectivePaused: z.boolean(),
    manualPaused: z.boolean(),
    mode: z.enum([
      'manual_pause',
      'auto_pause',
      'recovery_pause',
      'active',
      'unavailable'
    ]),
    blockers: z.array(
      z.object({
        code: z.string(),
        source: z.string(),
        message: z.string(),
        recommendation: z.string(),
        retryAt: z.string().datetime().nullable()
      })
    ),
    health: featureCapabilitySchema.extend({
      risk: riskSchema,
      score: z.number().min(0).max(100).nullable(),
      autoPauseAt: riskSchema.nullable(),
      reasons: z.array(z.string()),
      recommendation: z.string(),
      stats: z.record(z.string(), z.unknown()).nullable()
    }),
    rates: featureCapabilitySchema.extend({
      minute: safetyRateWindowSchema.nullable(),
      hour: safetyRateWindowSchema.nullable(),
      day: safetyRateWindowSchema.nullable()
    }),
    warmup: featureCapabilitySchema.extend({
      data: z
        .object({
          day: z.number().int().positive(),
          totalDays: z.number().int().positive(),
          sentToday: z.number().int().nonnegative(),
          limitToday: z.number().int().nonnegative(),
          remainingToday: z.number().int().nonnegative(),
          progressRatio: z.number().min(0).max(1)
        })
        .nullable()
    }),
    timelock: featureCapabilitySchema.extend({
      active: z.boolean().nullable(),
      enforcementType: z.string().nullable().optional(),
      detectedAt: z.string().datetime().nullable().optional(),
      expiresAt: z.string().datetime().nullable().optional(),
      errorCount: z.number().int().nonnegative().optional()
    }),
    recovery: featureCapabilitySchema.extend({
      phase: z.string().nullable(),
      rateMultiplier: z.number().nonnegative().nullable(),
      pauseRemainingMs: z.number().nonnegative().nullable(),
      pauseUntil: z.string().datetime().nullable(),
      estimatedFullRecoveryAt: z.string().datetime().nullable(),
      recommendation: z.string().nullable(),
      shouldReplaceNumber: z.boolean().nullable(),
      resetEligible: z.boolean()
    }),
    delivery: featureCapabilitySchema.extend({
      data: z
        .object({
          sentInWindow: z.number().int().nonnegative(),
          deliveredInWindow: z.number().int().nonnegative(),
          deliveryRate: z.number().min(0).max(1).nullable(),
          sampleState: z.enum(['available', 'insufficient_sample']),
          windowMs: z.number().nonnegative()
        })
        .nullable()
    }),
    retry: featureCapabilitySchema.extend({
      data: z.record(z.string(), z.unknown()).nullable()
    }),
    reconnect: featureCapabilitySchema.extend({
      data: z.record(z.string(), z.unknown()).nullable()
    }),
    sessionStability: featureCapabilitySchema.extend({
      data: z.record(z.string(), z.unknown()).nullable()
    }),
    counters: z
      .object({
        messagesAllowed: z.number().int().nonnegative(),
        messagesBlocked: z.number().int().nonnegative(),
        totalDelayMs: z.number().nonnegative()
      })
      .nullable(),
    recentDelays: z.array(
      z.object({
        id: z.string(),
        messageId: z.string(),
        outboxId: z.string().nullable(),
        reasonCode: z.string(),
        message: z.string().nullable(),
        recommendation: z.string().nullable(),
        nextAttemptInMs: z.number().nonnegative().nullable(),
        occurredAt: z.string().datetime()
      })
    ),
    config: z.object({
      state: capabilityStateSchema,
      preset: z.literal('conservative'),
      mutable: z.boolean(),
      values: z
        .object({
          perMinute: z.number().positive(),
          perHour: z.number().positive(),
          perDay: z.number().positive(),
          minDelayMs: z.number().nonnegative(),
          maxDelayMs: z.number().nonnegative(),
          newChatDelayMs: z.number().nonnegative(),
          warmupDays: z.number().int().positive(),
          autoPauseAt: riskSchema
        })
        .nullable()
    }),
    capabilities: z.record(z.string(), featureCapabilitySchema),
    snapshot: z
      .object({
        risk: riskSchema,
        score: z.number().min(0).max(100).nullable(),
        paused: z.boolean(),
        reasons: z.array(z.string()),
        recommendation: z.string()
      })
      .optional()
  }),
  meta: z.object({
    requestId: z.string(),
    generatedAt: z.string().datetime()
  })
});

export const adminUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  role: z.enum(['viewer', 'operator', 'admin']),
  permissions: z.array(permissionSchema)
});

export const adminSessionResponseSchema = z.object({
  data: adminUserSchema,
  meta: z.object({
    requestId: z.string(),
    generatedAt: z.string().datetime()
  })
});

const cursorMetaSchema = z.object({
  requestId: z.string(),
  generatedAt: z.string().datetime(),
  nextCursor: z.string().nullable()
});

const identityStatusSchema = z.enum(['resolved', 'unresolved', 'conflict']);

export const conversationSchema = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  maskedPhone: z.string().nullable(),
  identityStatus: identityStatusSchema,
  lastMessage: z.object({
    id: z.string(),
    preview: z.string(),
    direction: z.enum(['incoming', 'outgoing']),
    messageType: z.string(),
    occurredAt: z.string().datetime()
  }),
  lastOutgoingStatus: z.string().nullable(),
  counts: z.object({
    incoming: z.number().int().nonnegative(),
    outgoing: z.number().int().nonnegative()
  })
});

export const conversationListResponseSchema = z.object({
  data: z.array(conversationSchema),
  meta: cursorMetaSchema
});

export const messageSchema = z.object({
  id: z.string(),
  providerMessageId: z.string().nullable(),
  direction: z.enum(['incoming', 'outgoing']),
  messageType: z.string(),
  content: z.string().nullable(),
  state: z.string(),
  createdAt: z.string().datetime()
});

export const messageListResponseSchema = z.object({
  data: z.array(messageSchema),
  meta: cursorMetaSchema
});

export const contactSchema = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  maskedPhone: z.string().nullable(),
  identity: z.object({
    status: identityStatusSchema,
    whatsappJid: z.string().nullable(),
    pnJid: z.string().nullable(),
    lidJid: z.string().nullable(),
    canonicalJid: z.string().nullable()
  }),
  counts: z.object({
    incoming: z.number().int().nonnegative(),
    outgoing: z.number().int().nonnegative()
  }),
  lastOutgoingStatus: z.string().nullable(),
  lastInteractionAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const contactListResponseSchema = z.object({
  data: z.array(contactSchema),
  meta: cursorMetaSchema
});

export const contactResponseSchema = z.object({
  data: contactSchema,
  meta: cursorMetaSchema.omit({ nextCursor: true })
});

export const handoffSchema = z.object({
  id: z.string().uuid(),
  contactId: z.string(),
  sourceMessageId: z.string(),
  state: z.enum(['open', 'assigned', 'in_progress', 'resolved', 'closed', 'canceled']),
  assigneeUserId: z.string().nullable(),
  dueAt: z.string().datetime().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  resolutionNote: z.string().nullable(),
  tenantId: z.string().uuid().nullable(),
  aiConversationId: z.string().uuid().nullable(),
  aiMessageTraceId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  priority: z.enum(['normal', 'high']),
  summary: z.string().nullable(),
  knowledgeIds: z.array(z.string()),
  safetyCategory: z.string().nullable(),
  traceId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  contact: z.object({
    displayName: z.string().nullable(),
    maskedPhone: z.string().nullable()
  }),
  sourcePreview: z.string()
});

export const handoffListResponseSchema = z.object({
  data: z.array(handoffSchema),
  meta: cursorMetaSchema
});

export const handoffResponseSchema = z.object({
  data: handoffSchema,
  meta: cursorMetaSchema.omit({ nextCursor: true })
});

export const outboxStateSchema = z.enum([
  'queued',
  'scheduled',
  'leased',
  'retrying',
  'safety_delayed',
  'failed',
  'completed',
  'canceled',
  'unknown_outcome'
]);

export const createMessageResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    outboxId: z.string().uuid(),
    state: z.literal('accepted')
  }),
  meta: cursorMetaSchema.omit({ nextCursor: true })
});

export const outboxItemSchema = z.object({
  id: z.string().uuid(),
  messageId: z.string().uuid(),
  state: outboxStateSchema,
  messageState: z.string(),
  priority: z.enum(['high', 'normal', 'low']),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  nextAttemptAt: z.string().datetime(),
  lastErrorCode: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  contact: z.object({
    displayName: z.string().nullable(),
    maskedPhone: z.string().nullable()
  }),
  preview: z.string()
});

export const outboxListResponseSchema = z.object({
  data: z.array(outboxItemSchema),
  meta: cursorMetaSchema
});

export const messageDetailResponseSchema = z.object({
  data: z.object({
    message: z.object({
      id: z.string().uuid(),
      direction: z.enum(['incoming', 'outgoing']),
      messageType: z.string(),
      content: z.string().nullable(),
      state: z.string(),
      priority: z.enum(['high', 'normal', 'low']),
      providerMessageId: z.string().nullable(),
      recipient: z.object({
        contactId: z.string(),
        displayName: z.string().nullable(),
        maskedPhone: z.string().nullable()
      }),
      scheduledAt: z.string().datetime().nullable(),
      queuedAt: z.string().datetime().nullable(),
      sendingAt: z.string().datetime().nullable(),
      sentAt: z.string().datetime().nullable(),
      deliveredAt: z.string().datetime().nullable(),
      readAt: z.string().datetime().nullable(),
      failedAt: z.string().datetime().nullable(),
      errorCode: z.string().nullable(),
      errorMessage: z.string().nullable(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime()
    }),
    outbox: z
      .object({
        id: z.string().uuid(),
        state: outboxStateSchema,
        attempts: z.number().int().nonnegative(),
        maxAttempts: z.number().int().positive(),
        nextAttemptAt: z.string().datetime().nullable()
      })
      .nullable(),
    events: z.array(
      z.object({
        id: z.string(),
        eventType: z.string(),
        reasonCode: z.string().nullable(),
        metadata: z.record(z.string(), z.unknown()),
        occurredAt: z.string().datetime()
      })
    )
  }),
  meta: cursorMetaSchema.omit({ nextCursor: true })
});

export const outboxTransitionResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    messageId: z.string().uuid(),
    state: z.enum(['canceled', 'queued'])
  }),
  meta: cursorMetaSchema.omit({ nextCursor: true })
});

export const reconciliationResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    messageId: z.string().uuid(),
    state: z.enum(['completed', 'failed'])
  }),
  meta: cursorMetaSchema.omit({ nextCursor: true })
});

export const chatbotRuleSchema = z.object({
  id: z.string().optional(),
  triggerType: z.enum(['exact', 'alias', 'empty', 'fallback']),
  triggerValues: z.array(z.string()),
  responseText: z.string(),
  priority: z.number().int(),
  enabled: z.boolean(),
  action: z.enum(['reply', 'create_handoff'])
});

const responseMetaSchema = cursorMetaSchema.omit({ nextCursor: true });

export const chatbotConfigResponseSchema = z.object({
  data: z.object({
    revision: z.number().int().nonnegative(),
    updatedAt: z.string().datetime(),
    rules: z.array(chatbotRuleSchema)
  }),
  meta: responseMetaSchema
});

export const chatbotTestResponseSchema = z.object({
  data: z.object({
    normalizedInput: z.string(),
    matchedRule: z
      .object({
        id: z.string().optional(),
        triggerType: z.enum(['exact', 'alias', 'empty', 'fallback']),
        priority: z.number().int(),
        matchedTrigger: z.string().nullable(),
        action: z.enum(['reply', 'create_handoff'])
      })
      .nullable(),
    response: z.string()
  }),
  meta: responseMetaSchema
});

const aiChatbotModulePathByKey = {
  overview: '/ai-chatbot/overview',
  knowledge: '/ai-chatbot/knowledge',
  instructions: '/ai-chatbot/instructions',
  playground: '/ai-chatbot/playground',
  conversations: '/ai-chatbot/conversations',
  unanswered: '/ai-chatbot/unanswered',
  handoffs: '/ai-chatbot/handoffs',
  analytics: '/ai-chatbot/analytics',
  settings: '/ai-chatbot/settings'
} as const;

const aiChatbotModuleSchema = z.object({
  key: z.enum([
    'overview',
    'knowledge',
    'instructions',
    'playground',
    'conversations',
    'unanswered',
    'handoffs',
    'analytics',
    'settings'
  ]),
  label: z.string(),
  path: z.string().startsWith('/ai-chatbot/'),
  state: z.enum(['available', 'planned']),
  targetSprint: z.number().int().min(0).max(8)
});

export const aiChatbotFoundationResponseSchema = z.object({
  data: z.object({
    apiVersion: z.literal('v1'),
    phase: z.literal('sprint_8'),
    status: z.enum(['development_ready', 'blocked']),
    runtime: z.object({
      enabled: z.boolean(),
      customerTraffic: z.enum(['enabled', 'disabled']),
      mode: z.literal('rag'),
      sourceOfTruth: z.literal('knowledge_base'),
      strictGrounding: z.boolean()
    }),
    tenant: z.object({
      state: capabilityStateSchema,
      strategy: z.literal('single_tenant_bootstrap'),
      tenantId: z.string().uuid().nullable()
    }),
    provider: z.object({
      state: capabilityStateSchema,
      name: z.string().nullable(),
      chatModel: z.string().nullable(),
      embeddingModel: z.string().nullable(),
      secretReferenceConfigured: z.boolean()
    }),
    infrastructure: z.object({
      vectorStore: z.object({
        state: capabilityStateSchema,
        adapter: z.literal('postgresql_pgvector')
      }),
      queue: z.object({
        state: capabilityStateSchema,
        adapter: z.literal('redis')
      }),
      objectStorage: z.object({
        state: capabilityStateSchema,
        adapter: z.literal('s3_compatible')
      })
    }),
    guardrails: z.object({
      faqOnly: z.literal(true),
      booking: z.literal(false),
      payments: z.literal(false),
      diagnosis: z.literal(false),
      personalizedMedicalAdvice: z.literal(false),
      freeGenerationWithoutContext: z.literal(false),
      fallbackAndHandoff: z.literal(true)
    }),
    modules: z.array(aiChatbotModuleSchema).length(9)
  }),
  meta: responseMetaSchema
}).superRefine((payload, context) => {
  const seenKeys = new Set<string>();
  payload.data.modules.forEach((module, index) => {
    if (seenKeys.has(module.key)) {
      context.addIssue({
        code: 'custom',
        path: ['data', 'modules', index, 'key'],
        message: `Duplicate AI chatbot module key: ${module.key}`
      });
    }
    seenKeys.add(module.key);

    if (module.path !== aiChatbotModulePathByKey[module.key]) {
      context.addIssue({
        code: 'custom',
        path: ['data', 'modules', index, 'path'],
        message: `Unexpected path for AI chatbot module ${module.key}`
      });
    }

    const shouldBeAvailable = ['overview', 'knowledge', 'instructions', 'playground', 'conversations', 'unanswered', 'handoffs', 'analytics', 'settings'].includes(
      module.key
    );
    if ((module.state === 'available') !== shouldBeAvailable) {
      context.addIssue({
        code: 'custom',
        path: ['data', 'modules', index, 'state'],
        message: `Unexpected Sprint 8 state for AI chatbot module ${module.key}`
      });
    }
  });

  if (
    payload.data.status === 'development_ready' &&
    (!payload.data.runtime.strictGrounding || !payload.data.tenant.tenantId)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['data', 'status'],
      message:
        'Development-ready AI foundation requires strict grounding and a bootstrap tenant'
    });
  }
});

const aiDependencyProbeStateSchema = z.enum([
  'reachable',
  'unreachable',
  'not_configured',
  'not_instrumented'
]);

const aiRetrievalSettingsSchema = z.object({
  topK: z.number().int().min(1).max(20),
  finalContextCount: z.number().int().min(1).max(10),
  minimumSimilarity: z.number().min(0).max(1).nullable(),
  maximumContextTokens: z.number().int().positive().nullable(),
  keywordSearchEnabled: z.boolean(),
  rerankerEnabled: z.boolean()
}).refine((value) => value.finalContextCount <= value.topK, {
  message: 'finalContextCount cannot exceed topK',
  path: ['finalContextCount']
});

const aiFeatureFlagsSchema = z.object({
  documentUpload: z.boolean(),
  autoHandoff: z.boolean(),
  analytics: z.boolean()
});

export const aiIntegrationSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  provider: z.string().nullable(),
  chatModel: z.string().nullable(),
  embeddingProvider: z.string().nullable(),
  embeddingModel: z.string().nullable(),
  embeddingDimensions: z.number().int().positive().nullable(),
  secretReferenceConfigured: z.boolean(),
  active: z.boolean(),
  effectiveEnabled: z.boolean(),
  strictGrounding: z.literal(true),
  maxResponseTokens: z.number().int().min(50).max(2000),
  temperature: z.number().min(0).max(1),
  timeoutMs: z.number().int().min(500).max(60_000),
  retryCount: z.number().int().min(0).max(3),
  retrieval: aiRetrievalSettingsSchema,
  featureFlags: aiFeatureFlagsSchema,
  revision: z.number().int().positive(),
  updatedAt: z.string().datetime()
});

export const aiReadinessSchema = z.object({
  effectiveEnabled: z.boolean(),
  blockers: z.array(z.object({ code: z.string(), message: z.string() })),
  dependencies: z.object({
    vectorStore: aiDependencyProbeStateSchema,
    queue: aiDependencyProbeStateSchema,
    objectStorage: aiDependencyProbeStateSchema,
    chatProvider: aiDependencyProbeStateSchema,
    embeddingProvider: aiDependencyProbeStateSchema,
    checkedAt: z.string().datetime()
  }),
  publishedPromptConfigured: z.boolean()
});

export const aiIntegrationResponseSchema = z.object({
  data: z.object({
    integration: aiIntegrationSchema,
    readiness: aiReadinessSchema
  }),
  meta: responseMetaSchema
});

export const aiConnectionTestResponseSchema = z.object({
  data: z.object({
    chatProvider: z.enum([
      'reachable',
      'unreachable',
      'invalid_configuration'
    ]),
    embeddingProvider: z.enum([
      'reachable',
      'unreachable',
      'invalid_configuration'
    ]),
    testedAt: z.string().datetime()
  }),
  meta: responseMetaSchema
});

export const aiPromptSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  version: z.number().int().positive(),
  status: z.enum(['draft', 'review', 'approved', 'published', 'archived']),
  primaryLanguage: z.string(),
  tone: z.string(),
  systemInstruction: z.string(),
  fallbackMessage: z.string(),
  handoffMessage: z.string(),
  disclaimerText: z.string().nullable(),
  maxAnswerLength: z.number().int().min(50).max(4000),
  createdBy: z.string().uuid(),
  approvedBy: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  approvedAt: z.string().datetime().nullable(),
  publishedAt: z.string().datetime().nullable()
});

export const aiPromptResponseSchema = z.object({
  data: aiPromptSchema,
  meta: responseMetaSchema
});

export const aiPromptListResponseSchema = z.object({
  data: z.array(aiPromptSchema),
  meta: responseMetaSchema.extend({ nextCursor: z.string().nullable() })
});

export const knowledgeCategorySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
  revision: z.number().int().positive(),
  knowledgeCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const knowledgeItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
  sourceType: z.enum(['faq', 'article']),
  versionId: z.string().uuid(),
  version: z.number().int().positive(),
  revision: z.number().int().positive(),
  status: z.enum(['draft', 'review', 'approved', 'published', 'archived']),
  title: z.string(),
  question: z.string().nullable(),
  questionVariants: z.array(z.string()).max(50),
  content: z.string(),
  sourceReference: z.string().nullable(),
  internalNotes: z.string().nullable(),
  tags: z.array(z.string()).max(20),
  metadata: z.record(z.string(), z.unknown()),
  contentFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  requiresDisclaimer: z.boolean(),
  priority: z.number().int().min(0).max(100),
  validFrom: z.string().datetime().nullable(),
  validUntil: z.string().datetime().nullable(),
  expired: z.boolean(),
  createdBy: z.string().uuid(),
  approvedBy: z.string().uuid().nullable(),
  publishedBy: z.string().uuid().nullable(),
  changeReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  approvedAt: z.string().datetime().nullable(),
  publishedAt: z.string().datetime().nullable()
});

export const knowledgeCategoryListResponseSchema = z.object({
  data: z.array(knowledgeCategorySchema),
  meta: responseMetaSchema
});

export const knowledgeCategoryResponseSchema = z.object({
  data: knowledgeCategorySchema,
  meta: responseMetaSchema
});

export const knowledgeListResponseSchema = z.object({
  data: z.array(knowledgeItemSchema),
  meta: responseMetaSchema.extend({ nextCursor: z.string().nullable() })
});

export const knowledgeResponseSchema = z.object({
  data: knowledgeItemSchema,
  meta: responseMetaSchema
});

export const knowledgeBulkResponseSchema = z.object({
  data: z.array(knowledgeItemSchema),
  meta: responseMetaSchema
});

export const knowledgeDocumentStatusSchema = z.enum([
  'uploaded', 'queued', 'extracting', 'cleaning', 'chunking',
  'embedding', 'ready', 'failed', 'archived'
]);

export const knowledgeDocumentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  categoryName: z.string().nullable(),
  filename: z.string(),
  mimeType: z.string(),
  extension: z.enum(['pdf', 'docx', 'txt', 'md', 'csv']),
  fileSize: z.number().nonnegative(),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  status: knowledgeDocumentStatusSchema,
  processingRevision: z.number().int().nonnegative(),
  attemptCount: z.number().int().nonnegative(),
  extractedCharacterCount: z.number().int().nonnegative(),
  pageCount: z.number().int().positive().nullable(),
  totalChunks: z.number().int().nonnegative(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  uploadedBy: z.string().uuid(),
  uploadedByName: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  processedAt: z.string().datetime().nullable()
});

export const knowledgeChunkPreviewSchema = z.object({
  id: z.string().uuid(),
  chunkIndex: z.number().int().nonnegative(),
  title: z.string().nullable(),
  section: z.string().nullable(),
  content: z.string(),
  tokenCount: z.number().int().positive(),
  status: z.enum(['active', 'inactive', 'failed']),
  embeddingModel: z.string(),
  metadata: z.record(z.string(), z.unknown())
});

export const knowledgeDocumentResponseSchema = z.object({
  data: knowledgeDocumentSchema,
  meta: responseMetaSchema
});

export const knowledgeDocumentListResponseSchema = z.object({
  data: z.array(knowledgeDocumentSchema),
  meta: responseMetaSchema.extend({ nextCursor: z.string().nullable() })
});

export const knowledgeDocumentPreviewResponseSchema = z.object({
  data: z.object({
    document: knowledgeDocumentSchema,
    extractionPreview: z.string().nullable(),
    chunks: z.array(knowledgeChunkPreviewSchema)
  }),
  meta: responseMetaSchema
});

export const knowledgeSearchTestResponseSchema = z.object({
  data: z.array(z.object({
    chunkId: z.string().uuid(),
    title: z.string().nullable(),
    section: z.string().nullable(),
    content: z.string(),
    score: z.number(),
    sourceType: z.string(),
    documentId: z.string().uuid().nullable(),
    knowledgeVersionId: z.string().uuid().nullable()
  })),
  meta: responseMetaSchema
});

export const ragSourceSchema = z.object({
  chunkId: z.string().uuid(),
  title: z.string().nullable(),
  section: z.string().nullable(),
  sourceType: z.string(),
  documentId: z.string().uuid().nullable(),
  knowledgeVersionId: z.string().uuid().nullable(),
  score: z.number(),
  rank: z.number().int().positive(),
  usedInPrompt: z.boolean(),
  usedInAnswer: z.boolean()
});

export const aiRagResultResponseSchema = z.object({
  data: z.object({
    conversationId: z.string().uuid(),
    reply: z.string(),
    answerStatus: z.enum([
      'supported', 'partially_supported', 'unsupported',
      'safety_fallback', 'admin_required'
    ]),
    requiresDisclaimer: z.boolean(),
    customerInterest: z.boolean(),
    handoff: z.boolean(),
    handoffReason: z.string().nullable(),
    usedKnowledge: z.array(ragSourceSchema),
    retrievedKnowledge: z.array(ragSourceSchema),
    traceId: z.string().uuid(),
    model: z.string().nullable(),
    promptVersionId: z.string().uuid().nullable(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    retrievalLatencyMs: z.number().int().nonnegative(),
    providerLatencyMs: z.number().int().nonnegative(),
    latencyMs: z.number().int().nonnegative(),
    validationStatus: z.enum(['validated', 'no_context', 'provider_error', 'invalid_output']),
    providerCalled: z.boolean(),
    idempotentReplay: z.boolean(),
    cacheHit: z.boolean(),
    safetyCategory: z.enum([
      'emergency', 'medical_personal', 'diagnosis_request', 'medication_dosage',
      'stop_treatment', 'prompt_injection', 'explicit_admin', 'normal_faq'
    ]),
    safetyFlags: z.array(z.string()),
    fallbackReason: z.string().nullable(),
    outputValidationReasons: z.array(z.string()),
    interestConfidence: z.number().min(0).max(1),
    historyMessagesUsed: z.number().int().min(0).max(10),
    handoffId: z.string().uuid().nullable(),
    handoffCreated: z.boolean()
  }),
  meta: responseMetaSchema
});

export const aiConversationLogSchema = z.object({
  id: z.string().uuid(),
  contactId: z.string(),
  customer: z.object({ displayName: z.string().nullable(), maskedIdentifier: z.string() }),
  channel: z.enum(['whatsapp', 'playground']),
  channelSessionId: z.string(),
  status: z.enum(['active', 'handed_off', 'closed']),
  topic: z.string().nullable(),
  interested: z.boolean(),
  summary: z.string().nullable(),
  lastKnowledgeIds: z.array(z.string()),
  handoffStatus: z.string().nullable(),
  traceCount: z.number().int().nonnegative(),
  fallbackCount: z.number().int().nonnegative(),
  handoff: z.boolean(),
  lastAnswerStatus: z.string().nullable(),
  lastModel: z.string().nullable(),
  lastTraceId: z.string().nullable(),
  reviewedBy: z.string().nullable(),
  startedAt: z.string().datetime(),
  lastMessageAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable()
});

const aiFeedbackTypeSchema = z.enum([
  'correct', 'incorrect', 'incomplete', 'unsafe',
  'wrong_source', 'too_long', 'too_promotional'
]);
export const aiFeedbackSchema = z.object({
  id: z.string().uuid(), type: aiFeedbackTypeSchema,
  comment: z.string().nullable(), correctKnowledgeIds: z.array(z.string().uuid()),
  suggestedAnswer: z.string().nullable(), reviewerId: z.string().uuid(),
  reviewedAt: z.string().datetime().nullable()
});
const aiConversationSourceSchema = z.object({
  chunkId: z.string().uuid(), title: z.string().nullable(), section: z.string().nullable(),
  sourceType: z.string(), score: z.coerce.number(), rank: z.number().int().positive(),
  usedInPrompt: z.boolean(), usedInAnswer: z.boolean(),
  knowledgeVersionId: z.string().uuid().nullable(), documentId: z.string().uuid().nullable()
});
export const aiConversationMessageSchema = z.object({
  id: z.string().uuid(), sourceMessageId: z.string(), responseMessageId: z.string().nullable(),
  customerMessage: z.string(), assistantMessage: z.string().nullable(),
  answerStatus: z.string(), validationStatus: z.string(), fallbackReason: z.string().nullable(),
  safetyCategory: z.string(), handoff: z.boolean(), requiresDisclaimer: z.boolean(),
  model: z.string().nullable(), promptVersionId: z.string().uuid().nullable(),
  inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(),
  retrievalLatencyMs: z.number().int().nonnegative(), providerLatencyMs: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(), traceId: z.string(),
  cacheHit: z.boolean().default(false),
  sources: z.array(aiConversationSourceSchema), feedback: aiFeedbackSchema.nullable(),
  createdAt: z.string().datetime()
});
export const aiConversationListResponseSchema = z.object({
  data: z.array(aiConversationLogSchema), meta: responseMetaSchema.extend({ nextCursor: z.string().nullable() })
});
export const aiConversationResponseSchema = z.object({ data: aiConversationLogSchema, meta: responseMetaSchema });
export const aiConversationMessageListResponseSchema = z.object({
  data: z.array(aiConversationMessageSchema), meta: responseMetaSchema.extend({ nextCursor: z.string().nullable() })
});
export const aiFeedbackResponseSchema = z.object({ data: aiFeedbackSchema, meta: responseMetaSchema });

export const unansweredQuestionSchema = z.object({
  id: z.string().uuid(), sampleQuestion: z.string(), normalizedQuestion: z.string(),
  occurrenceCount: z.number().int().positive(), bestSimilarity: z.number().nullable(),
  nearestKnowledgeIds: z.array(z.string()), predictedCategoryId: z.string().uuid().nullable(),
  predictedCategoryName: z.string().nullable(),
  status: z.enum(['new', 'reviewing', 'knowledge_created', 'ignored', 'resolved']),
  reviewedBy: z.string().uuid().nullable(), resolvedKnowledgeItemId: z.string().uuid().nullable(),
  reviewNote: z.string().nullable(), conversationIds: z.array(z.string().uuid()),
  firstSeenAt: z.string().datetime(), lastSeenAt: z.string().datetime()
});
export const unansweredListResponseSchema = z.object({
  data: z.array(unansweredQuestionSchema), meta: responseMetaSchema.extend({ nextCursor: z.string().nullable() })
});
export const unansweredResponseSchema = z.object({ data: unansweredQuestionSchema, meta: responseMetaSchema });
export const unansweredKnowledgeResponseSchema = z.object({
  data: z.object({ unanswered: unansweredQuestionSchema, knowledge: knowledgeItemSchema }), meta: responseMetaSchema
});

export const aiTestRunSchema = z.object({
  id: z.string().uuid(), testCaseId: z.string().uuid().optional(), passed: z.boolean(),
  score: z.number().min(0).max(1), checks: z.record(z.string(), z.boolean()),
  answerStatus: z.string(), answerPreview: z.string(), traceId: z.string(), ranAt: z.string().datetime()
});
export const aiTestCaseSchema = z.object({
  id: z.string().uuid(), name: z.string(), question: z.string(), recentContext: z.array(z.string()),
  promptVersionId: z.string().uuid().nullable(), expectedCategory: z.string().nullable(),
  expectedKnowledgeIds: z.array(z.string()), mustContain: z.array(z.string()),
  mustNotContain: z.array(z.string()), expectedHandoff: z.boolean().nullable(), active: z.boolean(),
  createdBy: z.string().uuid(), updatedBy: z.string().uuid(), createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(), runs: z.array(aiTestRunSchema)
});
export const aiTestCaseListResponseSchema = z.object({ data: z.array(aiTestCaseSchema), meta: responseMetaSchema });
export const aiTestCaseResponseSchema = z.object({ data: aiTestCaseSchema, meta: responseMetaSchema });
export const aiTestCaseImportResponseSchema = z.object({
  data: z.object({ imported: z.number().int().min(1).max(300), testCases: z.array(aiTestCaseSchema) }),
  meta: responseMetaSchema
});
export const aiTestRunResponseSchema = z.object({
  data: aiTestRunSchema.extend({ result: aiRagResultResponseSchema.shape.data }), meta: responseMetaSchema
});
export const aiTestBatchResponseSchema = z.object({
  data: z.object({ total: z.number().int().nonnegative(), passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(), passRate: z.number().min(0).max(1),
    runs: z.array(aiTestRunSchema.extend({ result: aiRagResultResponseSchema.shape.data })) }),
  meta: responseMetaSchema
});

const analyticsCountSchema = z.object({ label: z.string(), count: z.number().int().nonnegative() });
export const aiAnalyticsResponseSchema = z.object({
  data: z.object({
    range: z.object({ from: z.string().datetime(), to: z.string().datetime() }),
    status: z.enum(['healthy', 'degraded']),
    warnings: z.array(z.object({ code: z.string(), severity: z.enum(['warning', 'critical']), message: z.string() })),
    kpis: z.object({
      totalQuestions: z.number().int().nonnegative(), conversationsToday: z.number().int().nonnegative(),
      answerRate: z.number().min(0).max(1), supportedAnswerRate: z.number().min(0).max(1),
      fallbackRate: z.number().min(0).max(1), handoffRate: z.number().min(0).max(1),
      customerInterestRate: z.number().min(0).max(1), unansweredRate: z.number().min(0).max(1),
      knowledgeCoverage: z.number().min(0).max(1), adminCorrectionRate: z.number().min(0).max(1),
      averageResponseMs: z.number().nonnegative(), averageRetrievalMs: z.number().nonnegative(),
      averageProviderMs: z.number().nonnegative(), averageSimilarity: z.number().min(0).max(1),
      activeKnowledge: z.number().int().nonnegative(), processingJobs: z.number().int().nonnegative(),
      handoffCount: z.number().int().nonnegative(), handoffBacklog: z.number().int().nonnegative(),
      unansweredCount: z.number().int().nonnegative(), cacheHitRate: z.number().min(0).max(1),
      inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative()
    }),
    cost: z.object({ instrumented: z.boolean(), chatUsd: z.number().nullable(), embeddingUsd: z.number().nullable(),
      totalUsd: z.number().nullable(), budgetUsd: z.number().nullable(), perAnsweredConversationUsd: z.number().nullable(),
      embeddingTokens: z.number().int().nonnegative() }),
    series: z.array(z.object({ date: z.string(), conversations: z.number().int().nonnegative(),
      answered: z.number().int().nonnegative(), fallback: z.number().int().nonnegative(),
      handoff: z.number().int().nonnegative(), estimatedCostUsd: z.number().nullable() })),
    topQuestions: z.array(analyticsCountSchema), topFallbackCategories: z.array(analyticsCountSchema),
    topKnowledge: z.array(analyticsCountSchema.extend({ id: z.string().uuid() })),
    handoffReasons: z.array(analyticsCountSchema)
  }), meta: responseMetaSchema
});
export const aiOperationalSettingsSchema = z.object({
  logRetentionDays: z.number().int().min(1).max(3650), cacheTtlSeconds: z.number().int().min(60).max(86400),
  dailyBudgetUsd: z.number().nonnegative().nullable(), chatInputCostPerMillionUsd: z.number().nonnegative().nullable(),
  chatOutputCostPerMillionUsd: z.number().nonnegative().nullable(), embeddingCostPerMillionUsd: z.number().nonnegative().nullable(),
  fallbackAlertRate: z.number().min(0).max(1), latencyAlertMs: z.number().int().min(100),
  queueAlertDepth: z.number().int().positive(), revision: z.number().int().positive(), updatedAt: z.string().datetime()
});
export const aiOperationalSettingsResponseSchema = z.object({ data: aiOperationalSettingsSchema, meta: responseMetaSchema });
export const aiVersionChangesResponseSchema = z.object({ data: z.array(z.object({
  kind: z.enum(['prompt', 'knowledge']), id: z.string().uuid(), version: z.number().int().positive(),
  title: z.string(), status: z.string(), reason: z.string().nullable(), publishedBy: z.string().uuid().nullable(),
  publishedAt: z.string().datetime().nullable(), changedFields: z.array(z.string())
})), meta: responseMetaSchema });

export const aiEvaluationReportSchema = z.object({
  id: z.string().uuid(), datasetSize: z.number().int().nonnegative(), passedCount: z.number().int().nonnegative(),
  supportedAccuracy: z.number().min(0).max(1), retrievalHitRate: z.number().min(0).max(1),
  handoffSuccessRate: z.number().min(0).max(1), systemErrorRate: z.number().min(0).max(1),
  criticalSafetyFailures: z.number().int().nonnegative(), gatePassed: z.boolean(),
  blockers: z.array(z.string()), generatedAt: z.string().datetime()
});
const releaseGateEvidenceSchema = z.object({
  status: z.enum(['pending', 'passed', 'failed']), evidence: z.string(), actorId: z.string().uuid(), recordedAt: z.string().datetime()
});
export const aiReleaseReadinessSchema = z.object({
  status: z.enum(['blocked', 'ready']), effectivePilotPercentage: z.number().int().min(0).max(100),
  requestedPilotPercentage: z.number().int().min(0).max(100), pilotChannels: z.array(z.string()),
  pilotNote: z.string().nullable(), targets: z.object({ minimumDatasetSize: z.number().int().min(100).max(300),
    supportedAccuracy: z.number().min(0).max(1), retrievalHitRate: z.number().min(0).max(1),
    handoffSuccessRate: z.number().min(0).max(1), systemErrorRate: z.number().min(0).max(1) }),
  gates: z.record(z.string(), releaseGateEvidenceSchema), latestEvaluation: aiEvaluationReportSchema.nullable(),
  blockers: z.array(z.object({ code: z.string(), message: z.string() })),
  knowledge: z.object({ published: z.number().int().nonnegative(), missingSource: z.number().int().nonnegative(), documentsReady: z.number().int().nonnegative() }),
  revision: z.number().int().positive(), updatedAt: z.string().datetime()
});
export const aiReleaseReadinessResponseSchema = z.object({ data: aiReleaseReadinessSchema, meta: responseMetaSchema });
export const aiEvaluationReportResponseSchema = z.object({ data: aiEvaluationReportSchema, meta: responseMetaSchema });

export type OverviewResponse = z.infer<typeof overviewResponseSchema>;
export type OverviewData = OverviewResponse['data'];
export type ConnectionState = OverviewData['session']['state'];
export type Risk = OverviewData['safety']['risk'];
export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminSessionResponse = z.infer<typeof adminSessionResponseSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type QrResponse = z.infer<typeof qrResponseSchema>;
export type SafetyResponse = z.infer<typeof safetyResponseSchema>;
export type SafetyCenterResponse = z.infer<typeof safetyCenterResponseSchema>;
export type SafetyCenterData = SafetyCenterResponse['data'];
export type Conversation = z.infer<typeof conversationSchema>;
export type ConversationListResponse = z.infer<
  typeof conversationListResponseSchema
>;
export type Message = z.infer<typeof messageSchema>;
export type MessageListResponse = z.infer<typeof messageListResponseSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type ContactListResponse = z.infer<typeof contactListResponseSchema>;
export type ContactResponse = z.infer<typeof contactResponseSchema>;
export type Handoff = z.infer<typeof handoffSchema>;
export type HandoffListResponse = z.infer<typeof handoffListResponseSchema>;
export type HandoffResponse = z.infer<typeof handoffResponseSchema>;
export type AiConversationLog = z.infer<typeof aiConversationLogSchema>;
export type AiConversationMessage = z.infer<typeof aiConversationMessageSchema>;
export type AiConversationListResponse = z.infer<typeof aiConversationListResponseSchema>;
export type AiConversationMessageListResponse = z.infer<typeof aiConversationMessageListResponseSchema>;
export type AiFeedback = z.infer<typeof aiFeedbackSchema>;
export type UnansweredQuestion = z.infer<typeof unansweredQuestionSchema>;
export type UnansweredListResponse = z.infer<typeof unansweredListResponseSchema>;
export type AiTestCase = z.infer<typeof aiTestCaseSchema>;
export type AiTestRun = z.infer<typeof aiTestRunSchema>;
export type AiAnalyticsResponse = z.infer<typeof aiAnalyticsResponseSchema>;
export type AiOperationalSettings = z.infer<typeof aiOperationalSettingsSchema>;
export type AiReleaseReadiness = z.infer<typeof aiReleaseReadinessSchema>;
export type OutboxState = z.infer<typeof outboxStateSchema>;
export type OutboxItem = z.infer<typeof outboxItemSchema>;
export type OutboxListResponse = z.infer<typeof outboxListResponseSchema>;
export type CreateMessageResponse = z.infer<typeof createMessageResponseSchema>;
export type MessageDetailResponse = z.infer<
  typeof messageDetailResponseSchema
>;
export type OutboxTransitionResponse = z.infer<
  typeof outboxTransitionResponseSchema
>;
export type ReconciliationResponse = z.infer<
  typeof reconciliationResponseSchema
>;
export type ChatbotRule = z.infer<typeof chatbotRuleSchema>;
export type ChatbotConfigResponse = z.infer<
  typeof chatbotConfigResponseSchema
>;
export type ChatbotTestResponse = z.infer<typeof chatbotTestResponseSchema>;
export type AiChatbotFoundationResponse = z.infer<
  typeof aiChatbotFoundationResponseSchema
>;
export type AiChatbotModule = AiChatbotFoundationResponse['data']['modules'][number];
export type AiIntegration = z.infer<typeof aiIntegrationSchema>;
export type AiReadiness = z.infer<typeof aiReadinessSchema>;
export type AiIntegrationResponse = z.infer<
  typeof aiIntegrationResponseSchema
>;
export type AiConnectionTestResponse = z.infer<
  typeof aiConnectionTestResponseSchema
>;
export type AiPrompt = z.infer<typeof aiPromptSchema>;
export type AiPromptResponse = z.infer<typeof aiPromptResponseSchema>;
export type AiPromptListResponse = z.infer<typeof aiPromptListResponseSchema>;
export type KnowledgeCategory = z.infer<typeof knowledgeCategorySchema>;
export type KnowledgeItem = z.infer<typeof knowledgeItemSchema>;
export type KnowledgeCategoryListResponse = z.infer<typeof knowledgeCategoryListResponseSchema>;
export type KnowledgeCategoryResponse = z.infer<typeof knowledgeCategoryResponseSchema>;
export type KnowledgeListResponse = z.infer<typeof knowledgeListResponseSchema>;
export type KnowledgeResponse = z.infer<typeof knowledgeResponseSchema>;
export type KnowledgeDocumentStatus = z.infer<typeof knowledgeDocumentStatusSchema>;
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;
export type KnowledgeDocumentResponse = z.infer<typeof knowledgeDocumentResponseSchema>;
export type KnowledgeDocumentListResponse = z.infer<typeof knowledgeDocumentListResponseSchema>;
export type KnowledgeDocumentPreviewResponse = z.infer<typeof knowledgeDocumentPreviewResponseSchema>;
export type KnowledgeSearchTestResponse = z.infer<typeof knowledgeSearchTestResponseSchema>;
export type AiRagResultResponse = z.infer<typeof aiRagResultResponseSchema>;
