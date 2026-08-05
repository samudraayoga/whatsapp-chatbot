import {
  chatbotConfigResponseSchema,
  chatbotTestResponseSchema,
  type ChatbotConfigResponse,
  type ChatbotRule,
  type ChatbotTestResponse
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

export const getChatbotConfig = async (): Promise<ChatbotConfigResponse> => {
  return chatbotConfigResponseSchema.parse(
    await requestJson('/api/admin/v1/chatbot/config')
  );
};

export const saveChatbotConfig = async (input: {
  expectedRevision: number;
  rules: ChatbotRule[];
}): Promise<ChatbotConfigResponse> => {
  return chatbotConfigResponseSchema.parse(
    await requestJson('/api/admin/v1/chatbot/config', {
      method: 'PUT',
      headers: csrfHeaders(),
      body: JSON.stringify(input)
    })
  );
};

export const testChatbotRules = async (input: {
  input: string;
  rules: ChatbotRule[];
}): Promise<ChatbotTestResponse> => {
  return chatbotTestResponseSchema.parse(
    await requestJson('/api/admin/v1/chatbot/test', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify(input)
    })
  );
};
