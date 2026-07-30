import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../middleware/error.middleware.js';
import {
  AuditService,
  recordAuditOutcome
} from '../services/audit.service.js';
import {
  OutboxService,
  type MessagePriority,
  type OutboxState
} from '../services/outbox.service.js';
import { decodeCursor } from '../utils/cursor.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseUuid = (
  value: string | string[] | undefined,
  label: string
): string => {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new AppError(`${label} is invalid`, 400, 'INVALID_RESOURCE_ID');
  }
  return value;
};

const responseMeta = (request: Request) => ({
  requestId: request.requestId,
  generatedAt: new Date().toISOString()
});

export class AdminMessageController {
  constructor(
    private readonly outbox: OutboxService,
    private readonly audit: AuditService
  ) {}

  create = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const idempotencyKey = request.header('Idempotency-Key')?.trim() ?? '';
      if (idempotencyKey.length < 16 || idempotencyKey.length > 128) {
        throw new AppError(
          'Idempotency-Key must contain 16 to 128 characters',
          400,
          'INVALID_IDEMPOTENCY_KEY'
        );
      }
      const recipient =
        request.body?.recipient &&
        typeof request.body.recipient === 'object'
          ? request.body.recipient
          : {};
      const contactId =
        typeof recipient.contactId === 'string'
          ? recipient.contactId.trim()
          : '';
      const phone =
        typeof recipient.phone === 'string' ? recipient.phone.trim() : '';
      if (
        (contactId && phone) ||
        (!contactId && !phone) ||
        (contactId && !/^\d+$/.test(contactId))
      ) {
        throw new AppError(
          'Provide exactly one valid recipient contactId or phone',
          400,
          'INVALID_RECIPIENT'
        );
      }
      const rawText =
        typeof request.body?.message?.text === 'string'
          ? request.body.message.text
          : '';
      const text = rawText.replace(/\r\n?/g, '\n').trim();
      if (
        request.body?.message?.type !== 'text' ||
        !text ||
        text.length > 4096
      ) {
        throw new AppError(
          'Text message must contain 1 to 4096 characters',
          400,
          'INVALID_MESSAGE'
        );
      }
      const priority =
        typeof request.body?.priority === 'string'
          ? request.body.priority
          : 'normal';
      if (!['high', 'normal', 'low'].includes(priority)) {
        throw new AppError(
          'Message priority is invalid',
          400,
          'INVALID_PRIORITY'
        );
      }
      if (priority === 'high' && request.adminAuth!.role !== 'admin') {
        throw new AppError(
          'High-priority messages require an Admin role',
          403,
          'PERMISSION_DENIED',
          { permission: 'messages.priority.high' }
        );
      }
      const scheduledAt =
        typeof request.body?.scheduledAt === 'string'
          ? request.body.scheduledAt
          : null;
      if (
        scheduledAt &&
        (!Number.isFinite(Date.parse(scheduledAt)) ||
          new Date(scheduledAt).getTime() <= Date.now() ||
          new Date(scheduledAt).getTime() >
            Date.now() + 366 * 24 * 60 * 60 * 1000)
      ) {
        throw new AppError(
          'scheduledAt must be a future ISO timestamp within one year',
          400,
          'INVALID_SCHEDULE'
        );
      }

      await this.audit.record({
        actorUserId: request.adminAuth!.id,
        action: 'message.accept_requested',
        resourceType: 'logical_message',
        afterState: {
          priority,
          recipientType: contactId ? 'contact' : 'phone'
        },
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      const result = await this.outbox.createMessage({
        actorUserId: request.adminAuth!.id,
        idempotencyKey,
        recipient: {
          ...(contactId ? { contactId } : {}),
          ...(phone ? { phone } : {})
        },
        text,
        priority: priority as MessagePriority,
        scheduledAt
      });
      await recordAuditOutcome(this.audit, {
        actorUserId: request.adminAuth!.id,
        action: 'message.accepted',
        resourceType: 'logical_message',
        resourceId: result.id,
        afterState: {
          state: 'accepted',
          outboxId: result.outboxId,
          priority,
          recipientType: contactId ? 'contact' : 'phone'
        },
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      response.status(202).json({
        data: result,
        meta: responseMeta(request)
      });
    } catch (error) {
      next(error);
    }
  };

  get = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const messageId = parseUuid(request.params.messageId, 'Message ID');
      const result = await this.outbox.getMessage(messageId);
      if (!result) {
        throw new AppError('Message was not found', 404, 'MESSAGE_NOT_FOUND');
      }
      response.json({ data: result, meta: responseMeta(request) });
    } catch (error) {
      next(error);
    }
  };

  listOutbox = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const state =
        typeof request.query.state === 'string' ? request.query.state : 'all';
      const validStates = [
        'all',
        'queued',
        'scheduled',
        'leased',
        'retrying',
        'safety_delayed',
        'failed',
        'completed',
        'canceled',
        'unknown_outcome'
      ];
      if (!validStates.includes(state)) {
        throw new AppError(
          'Outbox state filter is invalid',
          400,
          'INVALID_FILTER'
        );
      }
      const cursor =
        typeof request.query.cursor === 'string'
          ? request.query.cursor
          : undefined;
      const limit =
        typeof request.query.limit === 'string'
          ? Number(request.query.limit)
          : 30;
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
      const result = await this.outbox.listOutbox({
        state: state as OutboxState | 'all',
        cursor,
        limit
      });
      response.json({
        data: result.data,
        meta: {
          ...responseMeta(request),
          nextCursor: result.nextCursor
        }
      });
    } catch (error) {
      next(error);
    }
  };

  cancel = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const outboxId = parseUuid(request.params.outboxId, 'Outbox ID');
      await this.audit.record({
        actorUserId: request.adminAuth!.id,
        action: 'outbox.cancel_requested',
        resourceType: 'outbox_message',
        resourceId: outboxId,
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      const logicalId = await this.outbox.cancel(outboxId);
      if (!logicalId) {
        throw new AppError(
          'Outbox item was not found',
          404,
          'OUTBOX_NOT_FOUND'
        );
      }
      await recordAuditOutcome(this.audit, {
        actorUserId: request.adminAuth!.id,
        action: 'outbox.cancel',
        resourceType: 'outbox_message',
        resourceId: outboxId,
        afterState: { state: 'canceled', messageId: logicalId },
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      response.json({
        data: { id: outboxId, messageId: logicalId, state: 'canceled' },
        meta: responseMeta(request)
      });
    } catch (error) {
      next(error);
    }
  };

  retry = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const outboxId = parseUuid(request.params.outboxId, 'Outbox ID');
      await this.audit.record({
        actorUserId: request.adminAuth!.id,
        action: 'outbox.retry_requested',
        resourceType: 'outbox_message',
        resourceId: outboxId,
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      const logicalId = await this.outbox.retry(outboxId);
      if (!logicalId) {
        throw new AppError(
          'Outbox item was not found',
          404,
          'OUTBOX_NOT_FOUND'
        );
      }
      await recordAuditOutcome(this.audit, {
        actorUserId: request.adminAuth!.id,
        action: 'outbox.retry',
        resourceType: 'outbox_message',
        resourceId: outboxId,
        reason:
          typeof request.body?.reason === 'string'
            ? request.body.reason.trim().slice(0, 500)
            : undefined,
        afterState: { state: 'queued', messageId: logicalId },
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      response.json({
        data: { id: outboxId, messageId: logicalId, state: 'queued' },
        meta: responseMeta(request)
      });
    } catch (error) {
      next(error);
    }
  };

  reconcile = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (request.adminAuth!.role !== 'admin') {
        throw new AppError(
          'Unknown outcome reconciliation requires an Admin role',
          403,
          'PERMISSION_DENIED'
        );
      }
      const outboxId = parseUuid(request.params.outboxId, 'Outbox ID');
      const resolution =
        typeof request.body?.resolution === 'string'
          ? request.body.resolution
          : '';
      if (!['confirmed_sent', 'confirmed_not_sent'].includes(resolution)) {
        throw new AppError(
          'Reconciliation resolution is invalid',
          400,
          'INVALID_RECONCILIATION'
        );
      }
      const providerMessageId =
        typeof request.body?.providerMessageId === 'string'
          ? request.body.providerMessageId.trim()
          : null;
      if (
        resolution === 'confirmed_sent' &&
        (!providerMessageId || providerMessageId.length > 255)
      ) {
        throw new AppError(
          'providerMessageId is required when confirming sent',
          400,
          'INVALID_PROVIDER_MESSAGE_ID'
        );
      }
      const note =
        typeof request.body?.note === 'string'
          ? request.body.note.trim()
          : '';
      if (!note || note.length > 500) {
        throw new AppError(
          'Reconciliation note must contain 1 to 500 characters',
          400,
          'INVALID_RECONCILIATION_NOTE'
        );
      }
      await this.audit.record({
        actorUserId: request.adminAuth!.id,
        action: 'outbox.reconcile_requested',
        resourceType: 'outbox_message',
        resourceId: outboxId,
        reason: note,
        afterState: { resolution },
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      const result = await this.outbox.reconcileUnknown(
        outboxId,
        resolution as 'confirmed_sent' | 'confirmed_not_sent',
        providerMessageId
      );
      if (!result) {
        throw new AppError(
          'Outbox item was not found',
          404,
          'OUTBOX_NOT_FOUND'
        );
      }
      await recordAuditOutcome(this.audit, {
        actorUserId: request.adminAuth!.id,
        action: 'outbox.reconcile',
        resourceType: 'outbox_message',
        resourceId: outboxId,
        reason: note,
        afterState: {
          state: result.state,
          messageId: result.messageId,
          resolution
        },
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      response.json({
        data: { id: outboxId, ...result },
        meta: responseMeta(request)
      });
    } catch (error) {
      next(error);
    }
  };
}
