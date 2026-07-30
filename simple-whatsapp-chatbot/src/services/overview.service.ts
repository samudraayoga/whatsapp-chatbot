import type { AntiBanStats, ResolvedConfig } from 'baileys-antiban';
import { checkDatabaseHealth } from '../database/connection.js';
import { WhatsAppService } from './whatsapp.service.js';
import {
  OperationalEventService,
  type OperationalEvent
} from './operational-event.service.js';

type CapabilityState =
  | 'enabled'
  | 'disabled'
  | 'not_instrumented'
  | 'unavailable';

const riskOrder = ['low', 'medium', 'high', 'critical'] as const;

const isAtOrAboveRisk = (
  current: AntiBanStats['health']['risk'],
  threshold: ResolvedConfig['autoPauseAt']
): boolean =>
  riskOrder.indexOf(current) >= riskOrder.indexOf(threshold);

export class OverviewService {
  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly databaseHealthCheck: () => Promise<boolean> =
      checkDatabaseHealth,
    private readonly operationalEvents?: OperationalEventService
  ) {}

  async getOverview() {
    const databaseConnected = await this.databaseHealthCheck();
    const session = this.whatsappService.getOperationalStatus();
    const protection = this.whatsappService.getProtectionSnapshot();
    const manualPaused = this.whatsappService.isSendingPaused();
    const blockers: string[] = [];
    let recentEvents: OperationalEvent[] = [];

    if (!databaseConnected) blockers.push('database_unavailable');
    if (session.state !== 'connected') {
      blockers.push(`whatsapp_${session.state}`);
    }
    if (manualPaused) blockers.push('manual_pause');

    if (databaseConnected && this.operationalEvents) {
      recentEvents = await this.operationalEvents
        .listRecent(8)
        .catch(() => []);
    }

    let safety;
    let rates;
    let warmup;
    let safetyCapability: CapabilityState = 'unavailable';

    if (protection) {
      const { stats, config } = protection;
      const healthAutoPaused = isAtOrAboveRisk(
        stats.health.risk,
        config.autoPauseAt
      );
      const recoveryPaused = stats.banRecovery?.phase === 'paused';

      if (healthAutoPaused) blockers.push('health_auto_pause');
      if (recoveryPaused) blockers.push('recovery_paused');

      safety = {
        risk: stats.health.risk,
        score: stats.health.score,
        paused: manualPaused || healthAutoPaused || recoveryPaused,
        reasons: stats.health.reasons,
        recommendation: stats.health.recommendation
      };
      rates = {
        minute: {
          used: stats.rateLimiter.lastMinute,
          limit: stats.rateLimiter.limits.perMinute
        },
        hour: {
          used: stats.rateLimiter.lastHour,
          limit: stats.rateLimiter.limits.perHour
        },
        day: {
          used: stats.rateLimiter.lastDay,
          limit: stats.rateLimiter.limits.perDay
        }
      };
      warmup = {
        day: stats.warmUp.day,
        totalDays: stats.warmUp.totalDays,
        sentToday: stats.warmUp.todaySent,
        limitToday: stats.warmUp.todayLimit,
        progressRatio: Math.max(
          0,
          Math.min(1, stats.warmUp.progress / 100)
        )
      };
      safetyCapability = 'enabled';
    } else {
      blockers.push('safety_unavailable');
      safety = {
        risk: 'unknown' as const,
        score: null,
        paused: true,
        reasons: ['Safety statistics are unavailable'],
        recommendation: 'Do not send until safety statistics are available.'
      };
      rates = {
        minute: null,
        hour: null,
        day: null
      };
      warmup = null;
    }

    return {
      readiness: {
        readyToSend: blockers.length === 0,
        blockers,
        database: databaseConnected ? ('connected' as const) : ('disconnected' as const),
        eventStream: 'connected' as const
      },
      session,
      safety,
      rates,
      warmup,
      outbox: null,
      followUp: null,
      capabilities: {
        safety: safetyCapability,
        outbox: 'disabled' as CapabilityState,
        followUp: 'disabled' as CapabilityState,
        eventStream: 'enabled' as CapabilityState
      },
      recentEvents
    };
  }
}
