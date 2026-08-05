import {
  aiConnectionTestResponseSchema,
  aiChatbotFoundationResponseSchema,
  aiIntegrationResponseSchema,
  aiPromptListResponseSchema,
  aiPromptResponseSchema,
  type AiChatbotFoundationResponse,
  type AiConnectionTestResponse,
  type AiIntegration,
  type AiIntegrationResponse,
  type AiPromptListResponse,
  type AiPromptResponse
} from './contracts';
import { requestJson } from './client';
import { readCookie } from './auth';

const csrfHeaders = (): HeadersInit => {
  const token = readCookie('admin_csrf');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'X-CSRF-Token': token } : {})
  };
};

export type UpdateAiIntegrationInput = Pick<
  AiIntegration,
  | 'name'
  | 'provider'
  | 'chatModel'
  | 'embeddingProvider'
  | 'embeddingModel'
  | 'embeddingDimensions'
  | 'strictGrounding'
  | 'maxResponseTokens'
  | 'temperature'
  | 'timeoutMs'
  | 'retryCount'
  | 'retrieval'
  | 'featureFlags'
> & {
  expectedRevision: number;
  secretReference?: string | null;
};

export type CreateAiPromptInput = {
  name: string;
  primaryLanguage: string;
  tone: string;
  systemInstruction: string;
  fallbackMessage: string;
  handoffMessage: string;
  disclaimerText: string | null;
  maxAnswerLength: number;
};

export const getAiChatbotFoundation = async (): Promise<AiChatbotFoundationResponse> =>
  aiChatbotFoundationResponseSchema.parse(
    await requestJson('/api/admin/v1/ai-chatbot/foundation')
  );

export const getAiIntegration = async (): Promise<AiIntegrationResponse> =>
  aiIntegrationResponseSchema.parse(
    await requestJson('/api/admin/v1/ai-chatbot/integration')
  );

export const updateAiIntegration = async (
  input: UpdateAiIntegrationInput
): Promise<AiIntegrationResponse> =>
  aiIntegrationResponseSchema.parse(
    await requestJson('/api/admin/v1/ai-chatbot/integration', {
      method: 'PUT',
      headers: csrfHeaders(),
      body: JSON.stringify(input)
    })
  );

export const testAiConnection = async (): Promise<AiConnectionTestResponse> =>
  aiConnectionTestResponseSchema.parse(
    await requestJson('/api/admin/v1/ai-chatbot/integration/test-connection', {
      method: 'POST',
      headers: csrfHeaders()
    })
  );

export const requestAiActivation = async (
  expectedRevision: number
): Promise<AiIntegrationResponse> =>
  aiIntegrationResponseSchema.parse(
    await requestJson('/api/admin/v1/ai-chatbot/integration/activate', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify({
        expectedRevision,
        acknowledgement: 'ACTIVATE_STRICT_GROUNDED_AI'
      })
    })
  );

export const deactivateAiIntegration = async (input: {
  expectedRevision: number;
  reason: string;
}): Promise<AiIntegrationResponse> =>
  aiIntegrationResponseSchema.parse(
    await requestJson('/api/admin/v1/ai-chatbot/integration/deactivate', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify(input)
    })
  );

export const listAiPrompts = async (): Promise<AiPromptListResponse> =>
  aiPromptListResponseSchema.parse(
    await requestJson('/api/admin/v1/ai-chatbot/prompts?limit=50')
  );

export const createAiPrompt = async (
  input: CreateAiPromptInput
): Promise<AiPromptResponse> =>
  aiPromptResponseSchema.parse(
    await requestJson('/api/admin/v1/ai-chatbot/prompts', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify(input)
    })
  );

const transitionPrompt = async (
  promptId: string,
  transition: 'approve' | 'publish',
  expectedVersion: number,
  changeReason: string
): Promise<AiPromptResponse> =>
  aiPromptResponseSchema.parse(
    await requestJson(
      `/api/admin/v1/ai-chatbot/prompts/${encodeURIComponent(promptId)}/${transition}`,
      {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ expectedVersion, changeReason })
      }
    )
  );

export const approveAiPrompt = (
  promptId: string,
  expectedVersion: number,
  changeReason: string
) => transitionPrompt(promptId, 'approve', expectedVersion, changeReason);

export const publishAiPrompt = (
  promptId: string,
  expectedVersion: number,
  changeReason: string
) => transitionPrompt(promptId, 'publish', expectedVersion, changeReason);
