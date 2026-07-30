import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../middleware/error.middleware.js';
import { AdminAuthService } from '../services/admin-auth.service.js';
import {
  AuditService,
  recordAuditOutcome
} from '../services/audit.service.js';
import { SafetyCenterService } from '../services/safety-center.service.js';

const meta = (request: Request) => ({
  requestId: request.requestId,
  generatedAt: new Date().toISOString()
});

const parseReason = (value: unknown, fallback?: string): string => {
  const reason = typeof value === 'string' ? value.trim() : fallback ?? '';
  if (reason.length < 5 || reason.length > 500) {
    throw new AppError(
      'Reason must contain 5 to 500 characters',
      400,
      'SAFETY_REASON_INVALID'
    );
  }
  return reason;
};

export class AdminSafetyController {
  constructor(
    private readonly safety: SafetyCenterService,
    private readonly audit: AuditService,
    private readonly auth: AdminAuthService
  ) {}

  getStats = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const snapshot = await this.safety.getSnapshot();
      response.json({
        data: {
          ...snapshot,
          snapshot: {
            risk: snapshot.health.risk,
            score: snapshot.health.score,
            paused: snapshot.effectivePaused,
            reasons: snapshot.health.reasons,
            recommendation: snapshot.health.recommendation
          }
        },
        meta: meta(request)
      });
    } catch (error) {
      next(error);
    }
  };

  metrics = async (
    _request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      response
        .type('text/plain; version=0.0.4; charset=utf-8')
        .send(await this.safety.getPrometheusMetrics());
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
      const before = await this.safety.getSnapshot();
      const reason = parseReason(
        request.body?.reason,
        'Emergency pause requested by operator'
      );
      await this.audit.record({
        actorUserId: request.adminAuth!.id,
        action: 'safety.pause_requested',
        resourceType: 'whatsapp_session',
        reason,
        beforeState: {
          effectivePaused: before.effectivePaused,
          manualPaused: before.manualPaused,
          mode: before.mode
        },
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      const after = await this.safety.pause({
        actorUserId: request.adminAuth!.id,
        reason
      });
      await recordAuditOutcome(this.audit, {
        actorUserId: request.adminAuth!.id,
        action: 'safety.pause',
        resourceType: 'whatsapp_session',
        reason,
        beforeState: {
          effectivePaused: before.effectivePaused,
          manualPaused: before.manualPaused,
          mode: before.mode
        },
        afterState: {
          effectivePaused: after.effectivePaused,
          manualPaused: after.manualPaused,
          mode: after.mode
        },
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      response.json({
        data: {
          ...after,
          snapshot: {
            risk: after.health.risk,
            score: after.health.score,
            paused: after.effectivePaused,
            reasons: after.health.reasons,
            recommendation: after.health.recommendation
          }
        },
        meta: meta(request)
      });
    } catch (error) {
      next(error);
    }
  };

  resume = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const reason = parseReason(request.body?.reason);
      if (request.body?.acknowledgement !== 'I_UNDERSTAND_THE_RISK') {
        throw new AppError(
          'Exact risk acknowledgement is required',
          400,
          'SAFETY_ACKNOWLEDGEMENT_REQUIRED'
        );
      }
      const currentPassword =
        typeof request.body?.currentPassword === 'string'
          ? request.body.currentPassword
          : '';
      if (
        !(await this.auth.verifyUserPassword(
          request.adminAuth!.id,
          currentPassword
        ))
      ) {
        throw new AppError(
          'Step-up authentication failed',
          403,
          'STEP_UP_AUTHENTICATION_FAILED'
        );
      }
      const before = await this.safety.getSnapshot();
      await this.audit.record({
        actorUserId: request.adminAuth!.id,
        action: 'safety.resume_requested',
        resourceType: 'whatsapp_session',
        reason,
        beforeState: {
          effectivePaused: before.effectivePaused,
          manualPaused: before.manualPaused,
          risk: before.health.risk,
          recoveryPhase: before.recovery.phase
        },
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      const after = await this.safety.resume({
        actorUserId: request.adminAuth!.id,
        reason
      });
      await recordAuditOutcome(this.audit, {
        actorUserId: request.adminAuth!.id,
        action: 'safety.resume',
        resourceType: 'whatsapp_session',
        reason,
        beforeState: {
          effectivePaused: before.effectivePaused,
          manualPaused: before.manualPaused,
          risk: before.health.risk,
          recoveryPhase: before.recovery.phase
        },
        afterState: {
          effectivePaused: after.effectivePaused,
          manualPaused: after.manualPaused,
          risk: after.health.risk,
          recoveryPhase: after.recovery.phase
        },
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      response.json({
        data: {
          ...after,
          snapshot: {
            risk: after.health.risk,
            score: after.health.score,
            paused: after.effectivePaused,
            reasons: after.health.reasons,
            recommendation: after.health.recommendation
          }
        },
        meta: meta(request)
      });
    } catch (error) {
      next(error);
    }
  };

  reset = async (
    request: Request,
    response: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const reason = parseReason(request.body?.reason);
      if (request.body?.confirmation !== 'RESET_SAFETY_STATE') {
        throw new AppError(
          'Type RESET_SAFETY_STATE to confirm',
          400,
          'SAFETY_RESET_CONFIRMATION_REQUIRED'
        );
      }
      const currentPassword =
        typeof request.body?.currentPassword === 'string'
          ? request.body.currentPassword
          : '';
      if (
        !(await this.auth.verifyUserPassword(
          request.adminAuth!.id,
          currentPassword
        ))
      ) {
        throw new AppError(
          'Step-up authentication failed',
          403,
          'STEP_UP_AUTHENTICATION_FAILED'
        );
      }
      const before = await this.safety.getSnapshot();
      await this.audit.record({
        actorUserId: request.adminAuth!.id,
        action: 'safety.state_reset_requested',
        resourceType: 'whatsapp_session',
        reason,
        beforeState: {
          risk: before.health.risk,
          recoveryPhase: before.recovery.phase,
          timelockActive: before.timelock.active
        },
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      const after = await this.safety.reset({
        actorUserId: request.adminAuth!.id,
        reason
      });
      await recordAuditOutcome(this.audit, {
        actorUserId: request.adminAuth!.id,
        action: 'safety.state_reset',
        resourceType: 'whatsapp_session',
        reason,
        beforeState: {
          risk: before.health.risk,
          recoveryPhase: before.recovery.phase,
          timelockActive: before.timelock.active
        },
        afterState: {
          manualPaused: after.manualPaused,
          warmupDay: after.warmup.data?.day ?? null
        },
        requestId: request.requestId,
        ipAddress: request.ip,
        userAgent: request.get('user-agent')
      });
      response.json({ data: after, meta: meta(request) });
    } catch (error) {
      next(error);
    }
  };
}
