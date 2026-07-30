import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const errorMiddleware = (
  error: Error,
  _request: Request,
  response: Response,
  _next: NextFunction
): void => {
  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const isAdminApi = _request.path.startsWith('/api/admin/');

  if (isAdminApi) {
    const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
    response.status(statusCode).json({
      error: {
        code,
        message:
          statusCode >= 500 && env.NODE_ENV === 'production'
            ? 'Internal server error'
            : error.message || 'Internal server error',
        ...(error instanceof AppError && error.details
          ? { details: error.details }
          : {}),
        requestId: _request.requestId
      }
    });
    return;
  }

  const payload: Record<string, unknown> = {
    success: false,
    message: error.message || 'Internal server error'
  };

  if (env.NODE_ENV !== 'production' && error.stack) {
    payload.stack = error.stack;
  }

  response.status(statusCode).json(payload);
};
