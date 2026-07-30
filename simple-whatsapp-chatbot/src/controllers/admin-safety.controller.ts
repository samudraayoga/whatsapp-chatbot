import type { NextFunction, Request, Response } from 'express';
import { AuditService } from '../services/audit.service.js';
import { OverviewService } from '../services/overview.service.js';
import { WhatsAppService } from '../services/whatsapp.service.js';

export class AdminSafetyController {
  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly overviewService: OverviewService,
    private readonly auditService: AuditService
  ) {}

  getStats = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const overview = await this.overviewService.getOverview();
      response.json({
        data: {
          effectivePaused: overview.safety.paused,
          manualPaused: this.whatsappService.isSendingPaused(),
          snapshot: overview.safety,
          capabilities: overview.capabilities
        },
        meta: {
          requestId: request.requestId,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      next(error);
    }
  };

  pause = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const before = await this.overviewService.getOverview();
      this.whatsappService.pauseSending();
      const after = await this.overviewService.getOverview();

      await this.auditService.record({
        actorUserId: request.adminAuth!.id,
        action: 'safety.pause',
        resourceType: 'whatsapp_session',
        reason: 'Emergency pause requested by operator',
        beforeState: { paused: before.safety.paused },
        afterState: { paused: after.safety.paused },
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });

      response.json({
        data: {
          effectivePaused: after.safety.paused,
          manualPaused: this.whatsappService.isSendingPaused(),
          snapshot: after.safety,
          capabilities: after.capabilities
        },
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
