import {
  qrResponseSchema,
  safetyResponseSchema,
  sessionResponseSchema,
  type QrResponse,
  type SafetyResponse,
  type SessionResponse
} from './contracts';
import { requestJson } from './client';
import { readCookie } from './auth';

const isMockMode =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true';

const csrfHeaders = (): HeadersInit => {
  const csrfToken = readCookie('admin_csrf');
  return csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
};

const mockSession = async (): Promise<SessionResponse> => {
  const { getOverviewScenario } = await import('../mocks/scenario');
  const overview = getOverviewScenario();
  return {
    data: {
      session: overview.data.session,
      readiness: overview.data.readiness
    },
    meta: overview.meta
  };
};

export const getSession = async (): Promise<SessionResponse> => {
  if (isMockMode) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    return mockSession();
  }
  return sessionResponseSchema.parse(
    await requestJson('/api/admin/v1/session')
  );
};

export const getPairingQr = async (): Promise<QrResponse> => {
  if (isMockMode) {
    const session = await mockSession();
    if (session.data.session.state !== 'qr_required') {
      return Promise.reject(new Error('A pairing QR is not currently available'));
    }
    return {
      data: {
        qr: 'mock-whatsapp-pairing-qr-for-local-development',
        expiresAt: new Date(Date.now() + 60_000).toISOString()
      },
      meta: session.meta
    };
  }
  return qrResponseSchema.parse(
    await requestJson('/api/admin/v1/session/qr')
  );
};

export const reconnectSession = async (): Promise<SessionResponse> => {
  if (isMockMode) {
    const { setOverviewScenario } = await import('../mocks/scenario');
    setOverviewScenario('healthy');
    return mockSession();
  }
  return sessionResponseSchema.parse(
    await requestJson('/api/admin/v1/session/reconnect', {
      method: 'POST',
      headers: csrfHeaders()
    })
  );
};

export const pauseSending = async (): Promise<SafetyResponse> => {
  if (isMockMode) {
    const { setOverviewScenario, getOverviewScenario } = await import(
      '../mocks/scenario'
    );
    setOverviewScenario('high_risk');
    const overview = getOverviewScenario();
    return {
      data: {
        effectivePaused: true,
        manualPaused: true,
        snapshot: overview.data.safety,
        capabilities: overview.data.capabilities
      },
      meta: overview.meta
    };
  }
  return safetyResponseSchema.parse(
    await requestJson('/api/admin/v1/safety/pause', {
      method: 'POST',
      headers: csrfHeaders()
    })
  );
};
