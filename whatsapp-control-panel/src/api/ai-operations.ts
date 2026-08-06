import {
  aiConversationListResponseSchema,
  aiConversationMessageListResponseSchema,
  aiFeedbackResponseSchema,
  aiTestBatchResponseSchema,
  aiTestCaseListResponseSchema,
  aiTestCaseResponseSchema,
  aiTestCaseImportResponseSchema,
  aiTestRunResponseSchema,
  aiAnalyticsResponseSchema,
  aiOperationalSettingsResponseSchema,
  aiVersionChangesResponseSchema,
  aiReleaseReadinessResponseSchema,
  aiEvaluationReportResponseSchema,
  unansweredKnowledgeResponseSchema,
  unansweredListResponseSchema,
  unansweredResponseSchema,
  type AiConversationListResponse,
  type AiConversationMessageListResponse,
  type AiTestCase,
  type AiOperationalSettings,
  type UnansweredListResponse
} from './contracts';
import { readCookie } from './auth';
import { requestJson } from './client';

const csrfHeaders = (): HeadersInit => {
  const token = readCookie('admin_csrf');
  return { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) };
};
const query = (input: Record<string, string | number | boolean | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return params.toString() ? `?${params}` : '';
};

export type ConversationFilters = {
  query?: string; channel?: 'whatsapp' | 'playground'; answerStatus?: string;
  fallback?: boolean; handoff?: boolean; lowConfidence?: boolean; unanswered?: boolean;
  model?: string; from?: string; to?: string; cursor?: string; limit?: number;
};
export const listAiConversations = async (filters: ConversationFilters = {}): Promise<AiConversationListResponse> =>
  aiConversationListResponseSchema.parse(await requestJson(`/api/admin/v1/ai-chatbot/conversations${query(filters)}`));
export const listAiConversationMessages = async (conversationId: string): Promise<AiConversationMessageListResponse> =>
  aiConversationMessageListResponseSchema.parse(await requestJson(`/api/admin/v1/ai-chatbot/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`));
export const saveAiFeedback = async (traceId: string, input: {
  type: 'correct' | 'incorrect' | 'incomplete' | 'unsafe' | 'wrong_source' | 'too_long' | 'too_promotional';
  comment: string | null; correctKnowledgeIds: string[]; suggestedAnswer: string | null;
}) => aiFeedbackResponseSchema.parse(await requestJson(`/api/admin/v1/ai-chatbot/messages/${encodeURIComponent(traceId)}/feedback`, {
  method: 'POST', headers: csrfHeaders(), body: JSON.stringify(input)
}));

export const listUnanswered = async (input: { status?: string; query?: string; cursor?: string } = {}): Promise<UnansweredListResponse> =>
  unansweredListResponseSchema.parse(await requestJson(`/api/admin/v1/ai-chatbot/unanswered${query({ ...input, limit: 50 })}`));
export const updateUnanswered = async (id: string, input: Record<string, unknown>) =>
  unansweredResponseSchema.parse(await requestJson(`/api/admin/v1/ai-chatbot/unanswered/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: csrfHeaders(), body: JSON.stringify(input)
  }));
export const ignoreUnanswered = async (id: string, reason: string) =>
  unansweredResponseSchema.parse(await requestJson(`/api/admin/v1/ai-chatbot/unanswered/${encodeURIComponent(id)}/ignore`, {
    method: 'POST', headers: csrfHeaders(), body: JSON.stringify({ reason })
  }));
export const resolveUnanswered = async (id: string, reviewNote: string) =>
  unansweredResponseSchema.parse(await requestJson(`/api/admin/v1/ai-chatbot/unanswered/${encodeURIComponent(id)}/resolve`, {
    method: 'POST', headers: csrfHeaders(), body: JSON.stringify({ reviewNote })
  }));
export const createFaqFromUnanswered = async (id: string, input: {
  title?: string; answer: string; categoryId: string | null; requiresDisclaimer: boolean;
}) => unansweredKnowledgeResponseSchema.parse(await requestJson(`/api/admin/v1/ai-chatbot/unanswered/${encodeURIComponent(id)}/create-knowledge`, {
  method: 'POST', headers: csrfHeaders(), body: JSON.stringify(input)
}));

export type TestCaseWriteInput = Pick<AiTestCase,
  'name' | 'question' | 'recentContext' | 'promptVersionId' | 'expectedCategory' |
  'expectedKnowledgeIds' | 'mustContain' | 'mustNotContain' | 'expectedHandoff' | 'active'>;
export const listAiTestCases = async () => aiTestCaseListResponseSchema.parse(
  await requestJson('/api/admin/v1/ai-chatbot/playground/test-cases')
);
export const createAiTestCase = async (input: TestCaseWriteInput) => aiTestCaseResponseSchema.parse(
  await requestJson('/api/admin/v1/ai-chatbot/playground/test-cases', {
    method: 'POST', headers: csrfHeaders(), body: JSON.stringify(input)
  })
);
export const importAiTestCases = async (testCases: TestCaseWriteInput[]) => aiTestCaseImportResponseSchema.parse(
  await requestJson('/api/admin/v1/ai-chatbot/playground/test-cases/import', {
    method: 'POST', headers: csrfHeaders(), body: JSON.stringify({ testCases })
  })
);
export const updateAiTestCase = async (id: string, input: TestCaseWriteInput) => aiTestCaseResponseSchema.parse(
  await requestJson(`/api/admin/v1/ai-chatbot/playground/test-cases/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: csrfHeaders(), body: JSON.stringify(input)
  })
);
export const runAiTestCase = async (id: string) => aiTestRunResponseSchema.parse(
  await requestJson(`/api/admin/v1/ai-chatbot/playground/test-cases/${encodeURIComponent(id)}/run`, {
    method: 'POST', headers: csrfHeaders(), body: JSON.stringify({})
  })
);
export const runAiTestBatch = async (testCaseIds?: string[]) => aiTestBatchResponseSchema.parse(
  await requestJson('/api/admin/v1/ai-chatbot/playground/test-cases/run-batch', {
    method: 'POST', headers: csrfHeaders(), body: JSON.stringify({ testCaseIds })
  })
);

export const getAiAnalytics = async (from?: string, to?: string) => aiAnalyticsResponseSchema.parse(
  await requestJson(`/api/admin/v1/ai-chatbot/analytics/overview${query({ from, to })}`)
);
export const getAiVersionChanges = async () => aiVersionChangesResponseSchema.parse(
  await requestJson('/api/admin/v1/ai-chatbot/analytics/version-changes')
);
export const getAiOperationalSettings = async () => aiOperationalSettingsResponseSchema.parse(
  await requestJson('/api/admin/v1/ai-chatbot/operations/settings')
);
export const updateAiOperationalSettings = async (input: Omit<AiOperationalSettings, 'updatedAt'>) =>
  aiOperationalSettingsResponseSchema.parse(await requestJson('/api/admin/v1/ai-chatbot/operations/settings', {
    method: 'PUT', headers: csrfHeaders(), body: JSON.stringify(input)
  }));
export const anonymizeAiConversation = async (id: string) => requestJson(
  `/api/admin/v1/ai-chatbot/conversations/${encodeURIComponent(id)}/anonymize`,
  { method: 'POST', headers: csrfHeaders(), body: JSON.stringify({}) }
);

export const getAiReleaseReadiness = async () => aiReleaseReadinessResponseSchema.parse(
  await requestJson('/api/admin/v1/ai-chatbot/release-readiness')
);
export const generateAiEvaluationReport = async () => aiEvaluationReportResponseSchema.parse(
  await requestJson('/api/admin/v1/ai-chatbot/release-readiness/evaluate', {
    method: 'POST', headers: csrfHeaders(), body: JSON.stringify({})
  })
);
export const updateAiReleaseGate = async (key: string, input: {
  status: 'pending' | 'passed' | 'failed'; evidence: string; expectedRevision: number;
}) => aiReleaseReadinessResponseSchema.parse(await requestJson(
  `/api/admin/v1/ai-chatbot/release-readiness/gates/${encodeURIComponent(key)}`,
  { method: 'PUT', headers: csrfHeaders(), body: JSON.stringify(input) }
));
export const updateAiPilotConfiguration = async (input: {
  percentage: number; channels: string[]; note: string; expectedRevision: number;
}) => aiReleaseReadinessResponseSchema.parse(await requestJson('/api/admin/v1/ai-chatbot/release-readiness/pilot', {
  method: 'PUT', headers: csrfHeaders(), body: JSON.stringify(input)
}));
export const emergencyPauseAiPilot = async (reason: string) => aiReleaseReadinessResponseSchema.parse(
  await requestJson('/api/admin/v1/ai-chatbot/release-readiness/emergency-pause', {
    method: 'POST', headers: csrfHeaders(), body: JSON.stringify({ reason })
  })
);
