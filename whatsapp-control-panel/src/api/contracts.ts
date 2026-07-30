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
  state: z.enum(['open', 'assigned', 'resolved', 'canceled']),
  assigneeUserId: z.string().nullable(),
  dueAt: z.string().datetime().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  resolutionNote: z.string().nullable(),
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

export const chatbotVersionSchema = z.object({
  id: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  name: z.string(),
  status: z.enum(['draft', 'published', 'archived']),
  changeSummary: z.string().nullable(),
  basedOnVersionId: z.string().uuid().nullable(),
  revision: z.number().int().nonnegative(),
  contentHash: z.string().nullable(),
  createdBy: z.string().nullable(),
  publishedBy: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
  ruleCount: z.number().int().nonnegative()
});

const responseMetaSchema = cursorMetaSchema.omit({ nextCursor: true });

export const chatbotVersionListResponseSchema = z.object({
  data: z.array(chatbotVersionSchema),
  meta: responseMetaSchema
});

export const chatbotVersionDetailResponseSchema = z.object({
  data: z.object({
    version: chatbotVersionSchema,
    rules: z.array(chatbotRuleSchema)
  }),
  meta: responseMetaSchema
});

export const chatbotTestResponseSchema = z.object({
  data: z.object({
    versionId: z.string().uuid(),
    versionNumber: z.number().int().positive(),
    normalizedInput: z.string(),
    matchedRule: z.object({
      id: z.string().uuid(),
      triggerType: z.enum(['exact', 'alias', 'empty', 'fallback']),
      priority: z.number().int(),
      matchedTrigger: z.string().nullable(),
      action: z.enum(['reply', 'create_handoff'])
    }),
    response: z.string()
  }),
  meta: responseMetaSchema
});

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
export type ChatbotVersion = z.infer<typeof chatbotVersionSchema>;
export type ChatbotVersionListResponse = z.infer<
  typeof chatbotVersionListResponseSchema
>;
export type ChatbotVersionDetailResponse = z.infer<
  typeof chatbotVersionDetailResponseSchema
>;
export type ChatbotTestResponse = z.infer<typeof chatbotTestResponseSchema>;
