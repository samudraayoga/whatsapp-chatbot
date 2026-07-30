import type { AntiBanStats, ResolvedConfig } from 'baileys-antiban';
import { checkDatabaseHealth } from '../database/connection.js';
import { WhatsAppService } from './whatsapp.service.js';
import {
  OperationalEventService,
  type OperationalEvent
} from './operational-event.service.js';
import type { OutboxService } from './outbox.service.js';
import type { HandoffService } from './handoff.service.js';

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
    private readonly operationalEvents?: OperationalEventService,
    private readonly outbox?: Pick<OutboxService, 'getSummary'>,
    private readonly handoffs?: Pick<HandoffService, 'getSummary'>
  ) {}

  async getOverview() {
    const databaseConnected = await this.databaseHealthCheck();
    const session = this.whatsappService.getOperationalStatus();
    const protection = this.whatsappService.getProtectionSnapshot();
    const manualPaused = this.whatsappService.isSendingPaused();
    const blockers: string[] = [];
    let recentEvents: OperationalEvent[] = [];
    let outboxSummary = null;
    let followUpSummary = null;

    if (!databaseConnected) blockers.push('database_unavailable');
    if (session.state !== 'connected') {
      blockers.push(`whatsapp_${session.state}`);
    }
    const sendingBlocks =
      this.whatsappService.getSendingBlocks?.() ??
      (manualPaused
        ? [{ code: 'MANUAL_PAUSE' as const, retryAfterMs: 30_000 }]
        : []);
    for (const block of sendingBlocks) {
      blockers.push(block.code.toLowerCase());
    }

    if (databaseConnected && this.operationalEvents) {
      recentEvents = await this.operationalEvents
        .listRecent(8)
        .catch(() => []);
    }
    if (databaseConnected && this.outbox) {
      outboxSummary = await this.outbox.getSummary().catch(() => null);
    }
    if (databaseConnected && this.handoffs) {
      followUpSummary = await this.handoffs.getSummary().catch(() => null);
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
      const recoveryDead = stats.banRecovery?.phase === 'dead';
      const warmupLimited = stats.warmUp.todaySent >= stats.warmUp.todayLimit;

      safety = {
        risk: stats.health.risk,
        score: stats.health.score,
        paused:
          manualPaused ||
          healthAutoPaused ||
          recoveryPaused ||
          recoveryDead ||
          warmupLimited,
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
        eventStream:
          databaseConnected && this.operationalEvents
            ? ('connected' as const)
            : ('disconnected' as const)
      },
      session,
      safety,
      rates,
      warmup,
      outbox: outboxSummary,
      followUp: followUpSummary,
      capabilities: {
        safety: safetyCapability,
        outbox: (
          outboxSummary ? 'enabled' : databaseConnected ? 'unavailable' : 'unavailable'
        ) as CapabilityState,
        followUp: (
          followUpSummary ? 'enabled' : 'unavailable'
        ) as CapabilityState,
        eventStream: (
          databaseConnected && this.operationalEvents ? 'enabled' : 'unavailable'
        ) as CapabilityState
      },
      recentEvents
    };
  }
}
