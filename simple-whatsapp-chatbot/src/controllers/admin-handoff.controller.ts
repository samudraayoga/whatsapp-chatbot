import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../middleware/error.middleware.js';
import {
  AuditService,
  recordAuditOutcome
} from '../services/audit.service.js';
import {
  HandoffService,
  type HandoffState
} from '../services/handoff.service.js';
import { decodeCursor } from '../utils/cursor.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseUuid = (value: string | string[] | undefined): string => {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new AppError('Handoff ID is invalid', 400, 'INVALID_RESOURCE_ID');
  }
  return value;
};

export class AdminHandoffController {
  constructor(
    private readonly handoffs: HandoffService,
    private readonly audit: AuditService
  ) {}

  list = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const state =
        typeof request.query.state === 'string' ? request.query.state : 'open';
      const cursor =
        typeof request.query.cursor === 'string'
          ? request.query.cursor
          : undefined;
      const limit =
        typeof request.query.limit === 'string'
          ? Number(request.query.limit)
          : 30;
      if (!['all', 'open', 'assigned', 'resolved', 'canceled'].includes(state)) {
        throw new AppError('Handoff state is invalid', 400, 'INVALID_FILTER');
      }
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new AppError(
          'Limit must be an integer between 1 and 100',
          400,
          'INVALID_LIMIT'
        );
      }
      if (cursor && !decodeCursor(cursor)) {
        throw new AppError('Cursor is invalid', 400, 'INVALID_CURSOR');
      }

      const result = await this.handoffs.list({
        state: state as HandoffState | 'all',
        cursor,
        limit
      });
      response.json({
        data: result.data,
        meta: {
          requestId: request.requestId,
          generatedAt: new Date().toISOString(),
          nextCursor: result.nextCursor
        }
      });
    } catch (error) {
      next(error);
    }
  };

  assign = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = parseUuid(request.params.handoffId);
      const requestedAssignee =
        typeof request.body?.assigneeUserId === 'string'
          ? request.body.assigneeUserId
          : request.adminAuth!.id;
      if (!uuidPattern.test(requestedAssignee)) {
        throw new AppError(
          'Assignee user ID is invalid',
          400,
          'INVALID_ASSIGNEE'
        );
      }
      if (
        requestedAssignee !== request.adminAuth!.id &&
        !request.adminAuth!.permissions.includes('users.manage')
      ) {
        throw new AppError(
          'Operators may only claim a handoff for themselves',
          403,
          'PERMISSION_DENIED'
        );
      }
      const before = await this.handoffs.get(id);
      if (!before) {
        throw new AppError('Handoff was not found', 404, 'HANDOFF_NOT_FOUND');
      }
      await this.audit.record({
        actorUserId: request.adminAuth!.id,
        action: 'handoff.assign_requested',
        resourceType: 'handoff_task',
        resourceId: id,
        beforeState: before,
        afterState: { assigneeUserId: requestedAssignee },
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      const updated = await this.handoffs.assign(id, requestedAssignee);
      if (!updated) {
        throw new AppError(
          'Handoff is no longer open',
          409,
          'HANDOFF_STATE_CONFLICT'
        );
      }
      await recordAuditOutcome(this.audit, {
        actorUserId: request.adminAuth!.id,
        action: 'handoff.assign',
        resourceType: 'handoff_task',
        resourceId: id,
        beforeState: before,
        afterState: updated,
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      response.json({
        data: updated,
        meta: {
          requestId: request.requestId,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      next(error);
    }
  };

  resolve = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = parseUuid(request.params.handoffId);
      const resolutionNote =
        typeof request.body?.resolutionNote === 'string'
          ? request.body.resolutionNote.trim()
          : '';
      if (!resolutionNote || resolutionNote.length > 1000) {
        throw new AppError(
          'Resolution note must contain 1 to 1000 characters',
          400,
          'INVALID_RESOLUTION_NOTE'
        );
      }
      const before = await this.handoffs.get(id);
      if (!before) {
        throw new AppError('Handoff was not found', 404, 'HANDOFF_NOT_FOUND');
      }
      await this.audit.record({
        actorUserId: request.adminAuth!.id,
        action: 'handoff.resolve_requested',
        resourceType: 'handoff_task',
        resourceId: id,
        reason: resolutionNote,
        beforeState: before,
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      const updated = await this.handoffs.resolve(id, resolutionNote);
      if (!updated) {
        throw new AppError(
          'Handoff cannot be resolved from its current state',
          409,
          'HANDOFF_STATE_CONFLICT'
        );
      }
      await recordAuditOutcome(this.audit, {
        actorUserId: request.adminAuth!.id,
        action: 'handoff.resolve',
        resourceType: 'handoff_task',
        resourceId: id,
        beforeState: before,
        afterState: updated,
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      response.json({
        data: updated,
        meta: {
          requestId: request.requestId,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      next(error);
    }
  };
}
