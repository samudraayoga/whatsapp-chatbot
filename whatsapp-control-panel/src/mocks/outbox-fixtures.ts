import type {
  MessageDetailResponse,
  OutboxItem
} from '../api/contracts';

const now = '2026-07-30T06:20:00.000Z';

export const mockOutboxItems: OutboxItem[] = [
  {
    id: '2ddb725d-56c0-4708-8d81-1b868a3e8bd9',
    messageId: '59942ce7-4f15-4a8b-9448-a98f39d70d10',
    state: 'queued',
    messageState: 'queued',
    priority: 'normal',
    attempts: 0,
    maxAttempts: 3,
    nextAttemptAt: now,
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now,
    contact: { displayName: 'Nadia Putri', maskedPhone: '6281•••••120' },
    preview: 'Halo, pesan ini menunggu worker.'
  },
  {
    id: '0cc626b1-fc00-47e2-925b-97afbd220916',
    messageId: 'ef6b73bb-af31-46fb-a02c-4552d4e3c44f',
    state: 'unknown_outcome',
    messageState: 'unknown_outcome',
    priority: 'normal',
    attempts: 1,
    maxAttempts: 3,
    nextAttemptAt: now,
    lastErrorCode: 'PROVIDER_OUTCOME_UNKNOWN',
    createdAt: '2026-07-30T06:10:00.000Z',
    updatedAt: now,
    contact: { displayName: 'Raka Studio', maskedPhone: '6285•••••808' },
    preview: 'Pesan dengan hasil provider ambigu.'
  }
];

export const mockMessageDetails: Record<string, MessageDetailResponse['data']> = {
  '59942ce7-4f15-4a8b-9448-a98f39d70d10': {
    message: {
      id: '59942ce7-4f15-4a8b-9448-a98f39d70d10',
      direction: 'outgoing',
      messageType: 'text',
      content: 'Halo, pesan ini menunggu worker.',
      state: 'queued',
      priority: 'normal',
      providerMessageId: null,
      recipient: {
        contactId: '101',
        displayName: 'Nadia Putri',
        maskedPhone: '6281•••••120'
      },
      scheduledAt: null,
      queuedAt: now,
      sendingAt: null,
      sentAt: null,
      deliveredAt: null,
      readAt: null,
      failedAt: null,
      errorCode: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now
    },
    outbox: {
      id: '2ddb725d-56c0-4708-8d81-1b868a3e8bd9',
      state: 'queued',
      attempts: 0,
      maxAttempts: 3,
      nextAttemptAt: now
    },
    events: [
      {
        id: '1',
        eventType: 'accepted',
        reasonCode: null,
        metadata: { source: 'control_panel' },
        occurredAt: '2026-07-30T06:19:59.900Z'
      },
      {
        id: '2',
        eventType: 'queued',
        reasonCode: null,
        metadata: {},
        occurredAt: now
      }
    ]
  }
};
