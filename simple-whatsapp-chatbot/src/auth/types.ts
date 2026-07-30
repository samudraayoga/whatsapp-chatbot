import type { AdminRole, Permission } from './permissions.js';

export type AdminIdentity = {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  permissions: Permission[];
};

export type AuthenticatedAdmin = AdminIdentity & {
  sessionId: string;
  csrfTokenHash: string;
  expiresAt: Date;
};

export type LoginResult = {
  user: AdminIdentity;
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
};
