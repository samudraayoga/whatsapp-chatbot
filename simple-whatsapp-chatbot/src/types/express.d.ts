import type { AuthenticatedAdmin } from '../auth/types.js';
import type { TenantContext } from '../tenancy/types.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      adminAuth?: AuthenticatedAdmin;
      tenantContext?: TenantContext;
    }
  }
}

export {};
