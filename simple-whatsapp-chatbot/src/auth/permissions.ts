export const permissions = [
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
] as const;

export type Permission = (typeof permissions)[number];
export type AdminRole = 'viewer' | 'operator' | 'admin';

export const rolePermissions: Record<AdminRole, Permission[]> = {
  viewer: ['dashboard.read', 'contacts.read', 'messages.read'],
  operator: [
    'dashboard.read',
    'contacts.read',
    'messages.read',
    'messages.send',
    'messages.cancel',
    'handoffs.manage',
    'session.reconnect',
    'safety.pause'
  ],
  admin: [...permissions]
};

export const isAdminRole = (value: string): value is AdminRole =>
  value === 'viewer' || value === 'operator' || value === 'admin';

export const normalizePermissions = (
  role: AdminRole,
  storedPermissions: unknown
): Permission[] => {
  if (!Array.isArray(storedPermissions)) {
    return rolePermissions[role];
  }

  const allowed = new Set<string>(permissions);
  return storedPermissions.filter(
    (permission): permission is Permission =>
      typeof permission === 'string' && allowed.has(permission)
  );
};
