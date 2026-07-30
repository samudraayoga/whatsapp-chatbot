import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { AdminAuthService } from '../src/services/admin-auth.service.js';
import type { QueryExecutor } from '../src/services/message.service.js';
import { hashToken } from '../src/utils/security.js';

describe('admin password hashing', () => {
  it('stores a salted scrypt hash and verifies only the matching password', async () => {
    const password = 'correct horse battery staple';
    const storedHash = await hashPassword(password);

    expect(storedHash).toMatch(/^scrypt\$[^$]+\$[^$]+$/);
    expect(storedHash).not.toContain(password);
    await expect(verifyPassword(password, storedHash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', storedHash)).resolves.toBe(false);
  });

  it('fails closed for a malformed stored hash', async () => {
    await expect(verifyPassword('anything', 'plain-text')).resolves.toBe(false);
  });

  it('verifies the CSRF token against the session hash', () => {
    const service = new AdminAuthService({} as QueryExecutor, {
      sessionTtlMs: 60_000
    });
    const auth = {
      id: 'user-id',
      username: 'admin',
      displayName: 'Admin',
      role: 'admin' as const,
      permissions: ['dashboard.read' as const],
      sessionId: 'session-id',
      csrfTokenHash: hashToken('expected-token'),
      expiresAt: new Date(Date.now() + 60_000)
    };

    expect(service.verifyCsrf(auth, 'expected-token')).toBe(true);
    expect(service.verifyCsrf(auth, 'different-token')).toBe(false);
    expect(service.verifyCsrf(auth, '')).toBe(false);
  });
});
