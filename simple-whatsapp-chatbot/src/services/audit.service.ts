import { pool } from '../database/connection.js';
import type { QueryExecutor } from './message.service.js';
import { logger } from '../utils/logger.js';
import { sanitizeOperationalError } from '../utils/sanitize.js';

export type AuditEventInput = {
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  reason?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  requestId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export class AuditService {
  constructor(private readonly database: QueryExecutor = pool) {}

  async record(input: AuditEventInput): Promise<void> {
    await this.database.query(
      `
        INSERT INTO audit_logs (
          actor_user_id,
          action,
          resource_type,
          resource_id,
          reason,
          before_state,
          after_state,
          request_id,
          ip_address,
          user_agent
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);
      `,
      [
        input.actorUserId ?? null,
        input.action,
        input.resourceType,
        input.resourceId ?? null,
        input.reason ?? null,
        input.beforeState ? JSON.stringify(input.beforeState) : null,
        input.afterState ? JSON.stringify(input.afterState) : null,
        input.requestId,
        input.ipAddress ?? null,
        input.userAgent ?? null
      ]
    );
  }
}

export const recordAuditOutcome = async (
  audit: Pick<AuditService, 'record'>,
  input: AuditEventInput
): Promise<void> => {
  try {
    await audit.record(input);
  } catch (error) {
    logger.error('Audit outcome persistence failed after a recorded intent', {
      action: input.action,
      requestId: input.requestId,
      error: sanitizeOperationalError(error, 'Unknown audit persistence error')
    });
  }
};
