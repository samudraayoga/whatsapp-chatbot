import { pool } from '../database/connection.js';
import type { QueryExecutor } from './message.service.js';
import {
  defaultBootstrapTenantPermissions,
  tenantPermissions,
  type TenantContext,
  type TenantPermission
} from '../tenancy/types.js';

type TenantMembershipRow = {
  tenant_id: string;
  slug: string;
  name: string;
  permissions: unknown;
};

export class TenantContextResolutionError extends Error {
  constructor(
    message: string,
    readonly code: 'TENANT_CONTEXT_UNRESOLVED' | 'TENANT_CONTEXT_AMBIGUOUS'
  ) {
    super(message);
  }
}

const normalizeTenantPermissions = (value: unknown): TenantPermission[] => {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(tenantPermissions);
  return value.filter(
    (permission): permission is TenantPermission =>
      typeof permission === 'string' && allowed.has(permission)
  );
};

export class TenantContextService {
  constructor(private readonly database: QueryExecutor = pool) {}

  async ensureBootstrapTenant(input: {
    tenantId: string;
    slug: string;
    name: string;
  }): Promise<void> {
    await this.database.query(
      `
        INSERT INTO tenants (id, slug, name)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO NOTHING;
      `,
      [input.tenantId, input.slug, input.name]
    );

    await this.database.query(
      `
        INSERT INTO admin_tenant_memberships (
          tenant_id,
          admin_user_id,
          permissions
        )
        SELECT $1::uuid, users.id, $2::jsonb
        FROM admin_users users
        WHERE users.is_active = TRUE
          AND users.role = 'admin'
        ON CONFLICT (tenant_id, admin_user_id) DO NOTHING;
      `,
      [
        input.tenantId,
        JSON.stringify(defaultBootstrapTenantPermissions)
      ]
    );
  }

  async resolveForAdmin(adminUserId: string): Promise<TenantContext> {
    const result = await this.database.query<TenantMembershipRow>(
      `
        SELECT
          tenant.id AS tenant_id,
          tenant.slug,
          tenant.name,
          membership.permissions
        FROM admin_tenant_memberships membership
        INNER JOIN tenants tenant ON tenant.id = membership.tenant_id
        WHERE membership.admin_user_id = $1::uuid
          AND tenant.status = 'active'
        ORDER BY tenant.created_at ASC, tenant.id ASC
        LIMIT 2;
      `,
      [adminUserId]
    );

    if (result.rows.length === 0) {
      throw new TenantContextResolutionError(
        'No active AI tenant membership is available for this Admin',
        'TENANT_CONTEXT_UNRESOLVED'
      );
    }
    if (result.rows.length > 1) {
      throw new TenantContextResolutionError(
        'More than one active AI tenant membership requires an explicit server-side tenant selection policy',
        'TENANT_CONTEXT_AMBIGUOUS'
      );
    }

    const row = result.rows[0]!;
    return {
      tenantId: row.tenant_id,
      slug: row.slug,
      name: row.name,
      permissions: normalizeTenantPermissions(row.permissions)
    };
  }
}
