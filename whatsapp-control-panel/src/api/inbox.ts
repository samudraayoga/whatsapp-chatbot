import {
  contactListResponseSchema,
  contactResponseSchema,
  conversationListResponseSchema,
  handoffListResponseSchema,
  handoffResponseSchema,
  messageListResponseSchema,
  type ContactListResponse,
  type ContactResponse,
  type ConversationListResponse,
  type HandoffListResponse,
  type HandoffResponse,
  type MessageListResponse
} from './contracts';
import { readCookie } from './auth';
import { requestJson } from './client';

const queryString = (input: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
};

export const getConversations = async (input: {
  query?: string;
  status?: 'all' | 'has_failure' | 'identity_warning';
  cursor?: string;
  limit?: number;
}): Promise<ConversationListResponse> => {
  return conversationListResponseSchema.parse(
    await requestJson(
      `/api/admin/v1/conversations${queryString({
        query: input.query,
        status: input.status,
        cursor: input.cursor,
        limit: input.limit
      })}`
    )
  );
};

export const getMessages = async (input: {
  conversationId: string;
  cursor?: string;
  limit?: number;
}): Promise<MessageListResponse> => {
  return messageListResponseSchema.parse(
    await requestJson(
      `/api/admin/v1/conversations/${encodeURIComponent(input.conversationId)}/messages${queryString(
        { cursor: input.cursor, limit: input.limit }
      )}`
    )
  );
};

export const getContacts = async (input: {
  query?: string;
  cursor?: string;
  limit?: number;
}): Promise<ContactListResponse> => {
  return contactListResponseSchema.parse(
    await requestJson(
      `/api/admin/v1/contacts${queryString({
        query: input.query,
        cursor: input.cursor,
        limit: input.limit
      })}`
    )
  );
};

export const getContact = async (
  contactId: string
): Promise<ContactResponse> => {
  return contactResponseSchema.parse(
    await requestJson(
      `/api/admin/v1/contacts/${encodeURIComponent(contactId)}`
    )
  );
};

export const getHandoffs = async (input: {
  state?: 'all' | 'open' | 'assigned' | 'resolved' | 'canceled';
  cursor?: string;
  limit?: number;
}): Promise<HandoffListResponse> => {
  return handoffListResponseSchema.parse(
    await requestJson(
      `/api/admin/v1/handoffs${queryString({
        state: input.state,
        cursor: input.cursor,
        limit: input.limit
      })}`
    )
  );
};

const csrfHeaders = (): HeadersInit => {
  const token = readCookie('admin_csrf');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'X-CSRF-Token': token } : {})
  };
};

export const claimHandoff = async (
  handoffId: string
): Promise<HandoffResponse> => {
  return handoffResponseSchema.parse(
    await requestJson(
      `/api/admin/v1/handoffs/${encodeURIComponent(handoffId)}/assign`,
      {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({})
      }
    )
  );
};

export const resolveHandoff = async (
  handoffId: string,
  resolutionNote: string
): Promise<HandoffResponse> => {
  return handoffResponseSchema.parse(
    await requestJson(
      `/api/admin/v1/handoffs/${encodeURIComponent(handoffId)}/resolve`,
      {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ resolutionNote })
      }
    )
  );
};
