import {
  adminSessionResponseSchema,
  type AdminSessionResponse
} from './contracts';
import { requestJson } from './client';

export const login = async (credentials: {
  username: string;
  password: string;
}): Promise<AdminSessionResponse> => {
  return adminSessionResponseSchema.parse(
    await requestJson('/api/admin/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    })
  );
};

export const getCurrentAdmin = async (): Promise<AdminSessionResponse> => {
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
  const csrfToken = readCookie('admin_csrf');
  await requestJson('/api/admin/v1/auth/logout', {
    method: 'POST',
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {}
  });
};
