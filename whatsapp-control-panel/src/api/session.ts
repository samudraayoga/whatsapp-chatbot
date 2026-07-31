import {
  qrResponseSchema,
  safetyCenterResponseSchema,
  sessionResponseSchema,
  type QrResponse,
  type SafetyCenterResponse,
  type SessionResponse
} from './contracts';
import { requestJson } from './client';
import { readCookie } from './auth';

const csrfHeaders = (): HeadersInit => {
  const csrfToken = readCookie('admin_csrf');
  return csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
};

export const getSession = async (): Promise<SessionResponse> => {
  return sessionResponseSchema.parse(
    await requestJson('/api/admin/v1/session')
  );
};

export const getPairingQr = async (): Promise<QrResponse> => {
  return qrResponseSchema.parse(
    await requestJson('/api/admin/v1/session/qr')
  );
};

export const reconnectSession = async (): Promise<SessionResponse> => {
  return sessionResponseSchema.parse(
    await requestJson('/api/admin/v1/session/reconnect', {
      method: 'POST',
      headers: csrfHeaders()
    })
  );
};

export const resetWhatsAppSession = async (input: {
  reason: string;
  currentPassword: string;
  confirmation: string;
}): Promise<SessionResponse> => {
  return sessionResponseSchema.parse(
    await requestJson('/api/admin/v1/session/reset', {
      method: 'POST',
      headers: {
        ...csrfHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    })
  );
};

export const pauseSending = async (): Promise<SafetyCenterResponse> => {
  return safetyCenterResponseSchema.parse(
    await requestJson('/api/admin/v1/safety/pause', {
      method: 'POST',
      headers: csrfHeaders()
    })
  );
};
