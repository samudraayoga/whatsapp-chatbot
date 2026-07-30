import {
  createMessageResponseSchema,
  messageDetailResponseSchema,
  outboxListResponseSchema,
  reconciliationResponseSchema,
  outboxTransitionResponseSchema,
  type CreateMessageResponse,
  type MessageDetailResponse,
  type OutboxListResponse,
  type OutboxState,
  type OutboxTransitionResponse,
  type ReconciliationResponse
} from './contracts';
import { readCookie } from './auth';
import { requestJson } from './client';

const csrfHeaders = (): HeadersInit => {
  const token = readCookie('admin_csrf');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'X-CSRF-Token': token } : {})
  };
};

export const createMessage = async (input: {
  idempotencyKey: string;
  recipient: { contactId?: string; phone?: string };
  text: string;
  priority: 'high' | 'normal' | 'low';
  scheduledAt?: string | null;
}): Promise<CreateMessageResponse> => {
  return createMessageResponseSchema.parse(
    await requestJson('/api/admin/v1/messages', {
      method: 'POST',
      headers: {
        ...csrfHeaders(),
        'Idempotency-Key': input.idempotencyKey
      },
      body: JSON.stringify({
        recipient: input.recipient,
        message: { type: 'text', text: input.text },
        priority: input.priority,
        scheduledAt: input.scheduledAt ?? null
      })
    })
  );
};

export const getMessageDetail = async (
  messageId: string
): Promise<MessageDetailResponse> => {
  return messageDetailResponseSchema.parse(
    await requestJson(`/api/admin/v1/messages/${encodeURIComponent(messageId)}`)
  );
};

export const getOutbox = async (input: {
  state?: OutboxState | 'all';
  cursor?: string;
  limit?: number;
}): Promise<OutboxListResponse> => {
  const query = new URLSearchParams();
  if (input.state) query.set('state', input.state);
  if (input.cursor) query.set('cursor', input.cursor);
  if (input.limit) query.set('limit', String(input.limit));
  return outboxListResponseSchema.parse(
    await requestJson(`/api/admin/v1/outbox?${query.toString()}`)
  );
};

const transition = async (
  outboxId: string,
  action: 'cancel' | 'retry'
): Promise<OutboxTransitionResponse> => {
  return outboxTransitionResponseSchema.parse(
    await requestJson(
      `/api/admin/v1/outbox/${encodeURIComponent(outboxId)}/${action}`,
      {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify(
          action === 'retry' ? { reason: 'Operator controlled retry' } : {}
        )
      }
    )
  );
};

export const cancelOutbox = (outboxId: string) =>
  transition(outboxId, 'cancel');

export const retryOutbox = (outboxId: string) =>
  transition(outboxId, 'retry');

export const reconcileOutbox = async (input: {
  outboxId: string;
  resolution: 'confirmed_sent' | 'confirmed_not_sent';
  note: string;
  providerMessageId?: string;
}): Promise<ReconciliationResponse> => {
  return reconciliationResponseSchema.parse(
    await requestJson(
      `/api/admin/v1/outbox/${encodeURIComponent(input.outboxId)}/reconcile`,
      {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({
          resolution: input.resolution,
          note: input.note,
          providerMessageId: input.providerMessageId
        })
      }
    )
  );
};
