import {
  safetyCenterResponseSchema,
  type SafetyCenterResponse
} from './contracts';
import { readCookie } from './auth';
import { requestJson } from './client';

const csrfHeaders = (): HeadersInit => {
  const csrfToken = readCookie('admin_csrf');
  return {
    'Content-Type': 'application/json',
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
  };
};

export const getSafetyCenter = async (): Promise<SafetyCenterResponse> => {
  return safetyCenterResponseSchema.parse(
    await requestJson('/api/admin/v1/safety/stats')
  );
};

export const pauseSafety = async (
  reason: string
): Promise<SafetyCenterResponse> => {
  return safetyCenterResponseSchema.parse(
    await requestJson('/api/admin/v1/safety/pause', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify({ reason })
    })
  );
};

export const resumeSafety = async (input: {
  reason: string;
  currentPassword: string;
}): Promise<SafetyCenterResponse> => {
  return safetyCenterResponseSchema.parse(
    await requestJson('/api/admin/v1/safety/resume', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify({
        ...input,
        acknowledgement: 'I_UNDERSTAND_THE_RISK'
      })
    })
  );
};

export const resetSafety = async (input: {
  reason: string;
  currentPassword: string;
  confirmation: string;
}): Promise<SafetyCenterResponse> => {
  return safetyCenterResponseSchema.parse(
    await requestJson('/api/admin/v1/safety/reset', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify(input)
    })
  );
};
