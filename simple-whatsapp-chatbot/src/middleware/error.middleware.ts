import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

export class AppError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const errorMiddleware = (
  error: Error,
  _request: Request,
  response: Response,
  _next: NextFunction
): void => {
  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const payload: Record<string, unknown> = {
    success: false,
    message: error.message || 'Internal server error'
  };

  if (env.NODE_ENV !== 'production' && error.stack) {
    payload.stack = error.stack;
  }

  response.status(statusCode).json(payload);
};
