import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

export const apiKeyMiddleware = (request: Request, response: Response, next: NextFunction): void => {
  const apiKey = request.header('X-API-Key');

  if (!apiKey || apiKey !== env.API_KEY) {
    response.status(401).json({
      success: false,
      message: 'Invalid API key'
    });
    return;
  }

  next();
};
