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

const isMockMode =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true';

const mockMeta = () => ({
  requestId: 'req_mock_sprint_3',
  generatedAt: new Date().toISOString(),
  nextCursor: null
});

const mockBasicMeta = () => ({
  requestId: 'req_mock_sprint_3',
  generatedAt: new Date().toISOString()
});

const mockDelay = () =>
  new Promise((resolve) => window.setTimeout(resolve, 80));

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
  if (isMockMode) {
    const { mockConversations } = await import('../mocks/inbox-fixtures');
    await mockDelay();
    const query = input.query?.toLowerCase() ?? '';
    return {
      data: mockConversations.filter((conversation) => {
        const matchesQuery =
          `${conversation.displayName ?? ''} ${conversation.maskedPhone ?? ''}`
            .toLowerCase()
            .includes(query);
        const matchesStatus =
          !input.status ||
          input.status === 'all' ||
          (input.status === 'identity_warning' &&
            conversation.identityStatus !== 'resolved') ||
          (input.status === 'has_failure' &&
            conversation.lastOutgoingStatus === 'failed');
        return matchesQuery && matchesStatus;
      }),
      meta: mockMeta()
    };
  }
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
  if (isMockMode) {
    const { mockMessages } = await import('../mocks/inbox-fixtures');
    await mockDelay();
    return {
      data: mockMessages[input.conversationId] ?? [],
      meta: mockMeta()
    };
  }
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
  if (isMockMode) {
    const { mockContacts } = await import('../mocks/inbox-fixtures');
    await mockDelay();
    const query = input.query?.toLowerCase() ?? '';
    return {
      data: mockContacts.filter((contact) =>
        `${contact.displayName ?? ''} ${contact.maskedPhone ?? ''}`
          .toLowerCase()
          .includes(query)
      ),
      meta: mockMeta()
    };
  }
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
  if (isMockMode) {
    const { mockContacts } = await import('../mocks/inbox-fixtures');
    await mockDelay();
    const contact = mockContacts.find((candidate) => candidate.id === contactId);
    if (!contact) throw new Error('Contact was not found');
    return { data: contact, meta: mockBasicMeta() };
  }
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
  if (isMockMode) {
    const { mockHandoffs } = await import('../mocks/inbox-fixtures');
    await mockDelay();
    return {
      data:
        !input.state || input.state === 'all'
          ? mockHandoffs
          : mockHandoffs.filter((handoff) => handoff.state === input.state),
      meta: mockMeta()
    };
  }
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
  if (isMockMode) {
    const { mockHandoffs } = await import('../mocks/inbox-fixtures');
    const handoff = mockHandoffs.find((candidate) => candidate.id === handoffId);
    if (!handoff) throw new Error('Handoff was not found');
    handoff.state = 'assigned';
    handoff.assigneeUserId = 'local-admin';
    handoff.updatedAt = new Date().toISOString();
    return {
      data: { ...handoff },
      meta: mockBasicMeta()
    };
  }
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
  if (isMockMode) {
    const { mockHandoffs } = await import('../mocks/inbox-fixtures');
    const handoff = mockHandoffs.find((candidate) => candidate.id === handoffId);
    if (!handoff) throw new Error('Handoff was not found');
    const now = new Date().toISOString();
    handoff.state = 'resolved';
    handoff.resolutionNote = resolutionNote;
    handoff.resolvedAt = now;
    handoff.updatedAt = now;
    return {
      data: { ...handoff },
      meta: mockBasicMeta()
    };
  }
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
