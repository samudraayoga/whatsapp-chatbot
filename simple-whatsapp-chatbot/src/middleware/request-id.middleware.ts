import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const requestIdMiddleware = (
  request: Request,
  response: Response,
  next: NextFunction
): void => {
  request.requestId = randomUUID();
  response.setHeader('X-Request-ID', request.requestId);
  next();
};
