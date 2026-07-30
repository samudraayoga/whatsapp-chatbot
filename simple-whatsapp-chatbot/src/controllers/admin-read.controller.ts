import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../middleware/error.middleware.js';
import { ReadModelService } from '../services/read-model.service.js';
import { decodeCursor } from '../utils/cursor.js';

const parseListInput = (request: Request) => {
  const query =
    typeof request.query.query === 'string' ? request.query.query.trim() : '';
  const cursor =
    typeof request.query.cursor === 'string' ? request.query.cursor : undefined;
  const rawLimit =
    typeof request.query.limit === 'string' ? Number(request.query.limit) : 30;

  if (query.length > 100) {
    throw new AppError(
      'Search query must be at most 100 characters',
      400,
      'INVALID_QUERY'
    );
  }
  if (
    !Number.isInteger(rawLimit) ||
    rawLimit < 1 ||
    rawLimit > 100
  ) {
    throw new AppError(
      'Limit must be an integer between 1 and 100',
      400,
      'INVALID_LIMIT'
    );
  }
  if (cursor && !decodeCursor(cursor)) {
    throw new AppError('Cursor is invalid', 400, 'INVALID_CURSOR');
  }

  return {
    query: query || undefined,
    cursor,
    limit: rawLimit
  };
};

const parseId = (value: string | string[] | undefined, label: string): string => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new AppError(`${label} is invalid`, 400, 'INVALID_RESOURCE_ID');
  }
  return value;
};

const meta = (request: Request, nextCursor: string | null) => ({
  requestId: request.requestId,
  generatedAt: new Date().toISOString(),
  nextCursor
});

export class AdminReadController {
  constructor(private readonly readModel: ReadModelService) {}

  listConversations = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const input = parseListInput(request);
      const status =
        typeof request.query.status === 'string'
          ? request.query.status
          : 'all';
      if (!['all', 'has_failure', 'identity_warning'].includes(status)) {
        throw new AppError(
          'Conversation status filter is invalid',
          400,
          'INVALID_FILTER'
        );
      }
      const result = await this.readModel.listConversations({
        ...input,
        status: status as 'all' | 'has_failure' | 'identity_warning'
      });
      response.json({
        data: result.data,
        meta: meta(request, result.nextCursor)
      });
    } catch (error) {
      next(error);
    }
  };

  listMessages = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const contactId = parseId(request.params.conversationId, 'Conversation ID');
      const input = parseListInput(request);
      const contact = await this.readModel.getContact(contactId);
      if (!contact) {
        throw new AppError(
          'Conversation was not found',
          404,
          'CONVERSATION_NOT_FOUND'
        );
      }
      const result = await this.readModel.listMessages({
        contactId,
        cursor: input.cursor,
        limit: input.limit
      });
      response.json({
        data: result.data,
        meta: meta(request, result.nextCursor)
      });
    } catch (error) {
      next(error);
    }
  };

  listContacts = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await this.readModel.listContacts(parseListInput(request));
      response.json({
        data: result.data,
        meta: meta(request, result.nextCursor)
      });
    } catch (error) {
      next(error);
    }
  };

  getContact = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const contactId = parseId(request.params.contactId, 'Contact ID');
      const contact = await this.readModel.getContact(contactId);
      if (!contact) {
        throw new AppError('Contact was not found', 404, 'CONTACT_NOT_FOUND');
      }
      response.json({
        data: contact,
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
