import {
  adminSessionResponseSchema,
  type AdminSessionResponse
} from './contracts';
import { ApiClientError, requestJson } from './client';

const mockSessionKey = 'whatsapp-control-panel.mock-session';
const isMockMode =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true';

const mockSession = (): AdminSessionResponse => ({
  data: {
    id: 'local-admin',
    username: 'admin',
    displayName: 'Local Admin',
    role: 'admin',
    permissions: [
      'dashboard.read',
      'contacts.read',
      'messages.read',
      'messages.send',
      'messages.cancel',
      'handoffs.manage',
      'session.reconnect',
      'safety.pause',
      'safety.resume',
      'session.reset',
      'chatbot.manage',
      'audit.read',
      'users.manage'
    ]
  },
  meta: {
    requestId: 'req_mock_auth',
    generatedAt: new Date().toISOString()
  }
});

export const login = async (credentials: {
  username: string;
  password: string;
}): Promise<AdminSessionResponse> => {
  if (isMockMode) {
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    if (
      credentials.username !== 'admin' ||
      credentials.password !== 'admin123'
    ) {
      throw new ApiClientError('Username atau password salah.', 401);
    }
    window.sessionStorage.setItem(mockSessionKey, 'authenticated');
    return mockSession();
  }

  return adminSessionResponseSchema.parse(
    await requestJson('/api/admin/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    })
  );
};

export const getCurrentAdmin = async (): Promise<AdminSessionResponse> => {
  if (isMockMode) {
    if (window.sessionStorage.getItem(mockSessionKey) !== 'authenticated') {
      throw new ApiClientError('Authentication is required', 401);
    }
    return mockSession();
  }

  return adminSessionResponseSchema.parse(
    await requestJson('/api/admin/v1/me')
  );
};

export const readCookie = (name: string): string | undefined =>
  document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);

export const logout = async (): Promise<void> => {
  if (isMockMode) {
    window.sessionStorage.removeItem(mockSessionKey);
    return;
  }

  const csrfToken = readCookie('admin_csrf');
  await requestJson('/api/admin/v1/auth/logout', {
    method: 'POST',
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {}
  });
};
