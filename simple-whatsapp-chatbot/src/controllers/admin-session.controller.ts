import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../middleware/error.middleware.js';
import {
  AuditService,
  recordAuditOutcome
} from '../services/audit.service.js';
import { OperationalEventService } from '../services/operational-event.service.js';
import { OverviewService } from '../services/overview.service.js';
import {
  ReconnectNotAllowedError,
  WhatsAppService
} from '../services/whatsapp.service.js';

export class AdminSessionController {
  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly overviewService: OverviewService,
    private readonly auditService: AuditService,
    private readonly operationalEvents: OperationalEventService
  ) {}

  getSession = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const overview = await this.overviewService.getOverview();
      response.json({
        data: {
          session: overview.session,
          readiness: overview.readiness
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

  getQr = (request: Request, response: Response, next: NextFunction): void => {
    try {
      const pairingQr = this.whatsappService.getPairingQr();
      if (!pairingQr) {
        throw new AppError(
          'A pairing QR is not currently available',
          404,
          'PAIRING_QR_NOT_AVAILABLE'
        );
      }

      response.setHeader('Cache-Control', 'no-store, private');
      response.setHeader('Pragma', 'no-cache');
      response.json({
        data: pairingQr,
        meta: {
          requestId: request.requestId,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      next(error);
    }
  };

  reconnect = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    const before = this.whatsappService.getOperationalStatus();

    try {
      await this.auditService.record({
        actorUserId: request.adminAuth!.id,
        action: 'session.reconnect_requested_intent',
        resourceType: 'whatsapp_session',
        reason: 'Operator requested reconnect',
        beforeState: before,
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      await this.whatsappService.requestReconnect();
      const overview = await this.overviewService.getOverview();
      await recordAuditOutcome(this.auditService, {
        actorUserId: request.adminAuth!.id,
        action: 'session.reconnect_requested',
        resourceType: 'whatsapp_session',
        reason: 'Operator requested reconnect',
        beforeState: before,
        afterState: overview.session,
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });

      response.status(202).json({
        data: {
          session: overview.session,
          readiness: overview.readiness
        },
        meta: {
          requestId: request.requestId,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      if (error instanceof ReconnectNotAllowedError) {
        next(
          new AppError(
            'Reconnect is not allowed in the current session state',
            409,
            'RECONNECT_NOT_ALLOWED',
            { reason: error.reason, state: before.state }
          )
        );
        return;
      }
      next(error);
    }
  };

  events = (
    request: Request,
    response: Response
  ): void => {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    const sendOverview = async (id: string): Promise<void> => {
      if (response.writableEnded) return;
      try {
        const overview = await this.overviewService.getOverview();
        const payload = {
          data: overview,
          meta: {
            requestId: request.requestId,
            generatedAt: new Date().toISOString()
          }
        };
        response.write(`id: ${id}\n`);
        response.write('event: overview\n');
        response.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {
        if (!response.writableEnded) {
          response.write('event: stream_error\n');
          response.write(
            `data: ${JSON.stringify({ code: 'OVERVIEW_UNAVAILABLE', requestId: request.requestId })}\n\n`
          );
          response.end();
        }
      }
    };

    let sendChain = Promise.resolve();
    const queueOverview = (id: string) => {
      sendChain = sendChain.then(() => sendOverview(id));
    };

    queueOverview(`initial-${request.requestId}`);
    const unsubscribe = this.operationalEvents.subscribe((event) => {
      queueOverview(event.id);
    });
    const heartbeat = setInterval(() => {
      if (!response.writableEnded) {
        response.write(': heartbeat\n\n');
      }
    }, 15_000);

    request.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  };
}
