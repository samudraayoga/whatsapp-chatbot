import type { NextFunction, Request, Response } from 'express';
import { OverviewService } from '../services/overview.service.js';

export class AdminOverviewController {
  constructor(private readonly overviewService: OverviewService) {}

  getOverview = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response.json({
        data: await this.overviewService.getOverview(),
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
