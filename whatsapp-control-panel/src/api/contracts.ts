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

export type OverviewResponse = z.infer<typeof overviewResponseSchema>;
export type OverviewData = OverviewResponse['data'];
export type ConnectionState = OverviewData['session']['state'];
export type Risk = OverviewData['safety']['risk'];
export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminSessionResponse = z.infer<typeof adminSessionResponseSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type QrResponse = z.infer<typeof qrResponseSchema>;
export type SafetyResponse = z.infer<typeof safetyResponseSchema>;
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
