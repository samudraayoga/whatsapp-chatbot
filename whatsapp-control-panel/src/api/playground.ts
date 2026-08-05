import { aiRagResultResponseSchema, type AiRagResultResponse } from './contracts';
import { readCookie } from './auth';
import { requestJson } from './client';

export const testAlphaRag = async (message: string, options: {
  recentContext?: string[];
  promptVersionId?: string | null;
} = {}): Promise<AiRagResultResponse> => {
  const token = readCookie('admin_csrf');
  return aiRagResultResponseSchema.parse(
    await requestJson('/api/admin/v1/ai-chatbot/playground/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-CSRF-Token': token } : {})
      },
      body: JSON.stringify({ message, ...options })
    })
  );
};
