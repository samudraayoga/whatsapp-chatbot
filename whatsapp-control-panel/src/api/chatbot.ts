import {
  chatbotTestResponseSchema,
  chatbotVersionDetailResponseSchema,
  chatbotVersionListResponseSchema,
  type ChatbotRule,
  type ChatbotTestResponse,
  type ChatbotVersionDetailResponse,
  type ChatbotVersionListResponse
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

export const listChatbotVersions =
  async (): Promise<ChatbotVersionListResponse> => {
    return chatbotVersionListResponseSchema.parse(
      await requestJson('/api/admin/v1/chatbot/versions')
    );
  };

export const getChatbotVersion = async (
  versionId: string
): Promise<ChatbotVersionDetailResponse> => {
  return chatbotVersionDetailResponseSchema.parse(
    await requestJson(
      `/api/admin/v1/chatbot/versions/${encodeURIComponent(versionId)}`
    )
  );
};

export const createChatbotDraft = async (
  name: string
): Promise<ChatbotVersionDetailResponse> => {
  return chatbotVersionDetailResponseSchema.parse(
    await requestJson('/api/admin/v1/chatbot/versions/drafts', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify({ name })
    })
  );
};

export const replaceChatbotRules = async (input: {
  versionId: string;
  expectedRevision: number;
  rules: ChatbotRule[];
}): Promise<ChatbotVersionDetailResponse> => {
  return chatbotVersionDetailResponseSchema.parse(
    await requestJson(
      `/api/admin/v1/chatbot/versions/${encodeURIComponent(input.versionId)}/rules`,
      {
        method: 'PUT',
        headers: csrfHeaders(),
        body: JSON.stringify({
          expectedRevision: input.expectedRevision,
          rules: input.rules
        })
      }
    )
  );
};

export const testChatbotRules = async (input: {
  versionId: string;
  input: string;
}): Promise<ChatbotTestResponse> => {
  return chatbotTestResponseSchema.parse(
    await requestJson('/api/admin/v1/chatbot/test', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify(input)
    })
  );
};

export const publishChatbotVersion = async (input: {
  versionId: string;
  expectedActiveVersionId: string;
  changeSummary: string;
  confirmation: string;
}): Promise<ChatbotVersionDetailResponse> => {
  return chatbotVersionDetailResponseSchema.parse(
    await requestJson(
      `/api/admin/v1/chatbot/versions/${encodeURIComponent(input.versionId)}/publish`,
      {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify(input)
      }
    )
  );
};

export const rollbackChatbotVersion = async (input: {
  versionId: string;
  expectedActiveVersionId: string;
  reason: string;
  confirmation: string;
}): Promise<ChatbotVersionDetailResponse> => {
  return chatbotVersionDetailResponseSchema.parse(
    await requestJson(
      `/api/admin/v1/chatbot/versions/${encodeURIComponent(input.versionId)}/rollback`,
      {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify(input)
      }
    )
  );
};
