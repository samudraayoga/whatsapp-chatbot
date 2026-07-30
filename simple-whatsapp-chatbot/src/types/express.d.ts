import type { AuthenticatedAdmin } from '../auth/types.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      adminAuth?: AuthenticatedAdmin;
    }
  }
}

export {};
