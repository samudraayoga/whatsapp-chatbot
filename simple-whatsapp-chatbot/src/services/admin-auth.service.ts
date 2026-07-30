import { randomUUID, timingSafeEqual } from 'node:crypto';
import { pool } from '../database/connection.js';
import {
  isAdminRole,
  normalizePermissions,
  rolePermissions,
  type AdminRole
} from '../auth/permissions.js';
import type {
  AdminIdentity,
  AuthenticatedAdmin,
  LoginResult
} from '../auth/types.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { createOpaqueToken, hashToken } from '../utils/security.js';
import type { QueryExecutor } from './message.service.js';

type AdminAuthServiceOptions = {
  sessionTtlMs: number;
  now?: () => Date;
};

type AdminUserRow = {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: string;
  permissions: unknown;
  is_active: boolean;
};

type SessionRow = Omit<AdminUserRow, 'password_hash' | 'is_active'> & {
  session_id: string;
  csrf_token_hash: string;
  expires_at: Date;
};

const toIdentity = (
  row: Pick<AdminUserRow, 'id' | 'username' | 'display_name' | 'role' | 'permissions'>
): AdminIdentity => {
  const role: AdminRole = isAdminRole(row.role) ? row.role : 'viewer';

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role,
    permissions: normalizePermissions(role, row.permissions)
  };
};

export class AdminAuthService {
  private readonly now: () => Date;

  constructor(
    private readonly database: QueryExecutor = pool,
    private readonly options: AdminAuthServiceOptions
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async ensureBootstrapAdmin(input: {
    username: string;
    password: string;
    displayName: string;
  }): Promise<void> {
    const existing = await this.database.query<{ id: string }>(
      'SELECT id FROM admin_users WHERE username = $1 LIMIT 1;',
      [input.username]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      return;
    }

    const id = randomUUID();
    const passwordHash = await hashPassword(input.password);

    await this.database.query(
      `
        INSERT INTO admin_users (
          id,
          username,
          display_name,
          password_hash,
          role,
          permissions
        )
        VALUES ($1, $2, $3, $4, 'admin', $5)
        ON CONFLICT (username) DO NOTHING;
      `,
      [
        id,
        input.username,
        input.displayName,
        passwordHash,
        JSON.stringify(rolePermissions.admin)
      ]
    );
  }

  async login(username: string, password: string): Promise<LoginResult | null> {
    const result = await this.database.query<AdminUserRow>(
      `
        SELECT
          id,
          username,
          display_name,
          password_hash,
          role,
          permissions,
          is_active
        FROM admin_users
        WHERE username = $1
        LIMIT 1;
      `,
      [username]
    );
    const row = result.rows[0];

    if (!row?.is_active || !(await verifyPassword(password, row.password_hash))) {
      return null;
    }

    const sessionToken = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    const sessionId = randomUUID();
    const expiresAt = new Date(this.now().getTime() + this.options.sessionTtlMs);

    await this.database.query(
      `
        INSERT INTO admin_sessions (
          id,
          user_id,
          token_hash,
          csrf_token_hash,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5);
      `,
      [
        sessionId,
        row.id,
        hashToken(sessionToken),
        hashToken(csrfToken),
        expiresAt
      ]
    );

    return {
      user: toIdentity(row),
      sessionId,
      sessionToken,
      csrfToken,
      expiresAt
    };
  }

  async authenticate(sessionToken: string): Promise<AuthenticatedAdmin | null> {
    if (!sessionToken) {
      return null;
    }

    const result = await this.database.query<SessionRow>(
      `
        SELECT
          session.id AS session_id,
          session.csrf_token_hash,
          session.expires_at,
          users.id,
          users.username,
          users.display_name,
          users.role,
          users.permissions
        FROM admin_sessions session
        INNER JOIN admin_users users ON users.id = session.user_id
        WHERE session.token_hash = $1
          AND session.revoked_at IS NULL
          AND session.expires_at > $2
          AND users.is_active = TRUE
        LIMIT 1;
      `,
      [hashToken(sessionToken), this.now()]
    );
    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      ...toIdentity(row),
      sessionId: row.session_id,
      csrfTokenHash: row.csrf_token_hash,
      expiresAt: new Date(row.expires_at)
    };
  }

  verifyCsrf(auth: AuthenticatedAdmin, csrfToken: string): boolean {
    if (!csrfToken) {
      return false;
    }

    const actual = Buffer.from(hashToken(csrfToken), 'hex');
    const expected = Buffer.from(auth.csrfTokenHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  async verifyUserPassword(userId: string, password: string): Promise<boolean> {
    if (!password || password.length > 256) return false;
    const result = await this.database.query<{
      password_hash: string;
      is_active: boolean;
    }>(
      `
        SELECT password_hash, is_active
        FROM admin_users
        WHERE id = $1::uuid
        LIMIT 1;
      `,
      [userId]
    );
    const row = result.rows[0];
    return Boolean(
      row?.is_active && (await verifyPassword(password, row.password_hash))
    );
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.database.query(
      `
        UPDATE admin_sessions
        SET revoked_at = NOW()
        WHERE id = $1 AND revoked_at IS NULL;
      `,
      [sessionId]
    );
  }

  async removeExpiredSessions(): Promise<void> {
    await this.database.query(
      'DELETE FROM admin_sessions WHERE expires_at <= $1 OR revoked_at IS NOT NULL;',
      [this.now()]
    );
  }
}
