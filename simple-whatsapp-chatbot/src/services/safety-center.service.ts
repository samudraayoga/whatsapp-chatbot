import type { QueryExecutor } from './message.service.js';
import { pool } from '../database/connection.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';
import { OutboxService } from './outbox.service.js';
import { safetyReasonCopy, type SafetyReasonCode } from './safety-policy.js';
import { WhatsAppService } from './whatsapp.service.js';

type FeatureState = 'enabled' | 'disabled' | 'not_instrumented' | 'unavailable';

const riskOrder = ['low', 'medium', 'high', 'critical'] as const;

const ratio = (used: number, limit: number) =>
  limit > 0 ? Math.max(0, Math.min(1, used / limit)) : 0;

export class SafetyCenterService {
  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly outbox: Pick<OutboxService, 'getRecentSafetyDelays'>,
    private readonly database: QueryExecutor = pool
  ) {}

  async restoreManualState(): Promise<void> {
    const result = await this.database.query<{ manual_paused: boolean }>(
      `
        SELECT manual_paused
        FROM safety_control_state
        WHERE singleton = TRUE
        LIMIT 1;
      `
    );
    this.whatsapp.restoreManualPause(result.rows[0]?.manual_paused ?? false);
  }

  async pause(input: {
    actorUserId: string;
    reason: string;
  }) {
    this.whatsapp.pauseSending();
    await this.persistManualState(true, input.actorUserId, input.reason);
    return this.getSnapshot();
  }

  async resume(input: {
    actorUserId: string;
    reason: string;
  }) {
    const before = await this.getSnapshot();
    const hardBlock = before.blockers.find((blocker) =>
      ['RECOVERY_PAUSED', 'RECOVERY_DEAD', 'TIMELOCK_ACTIVE'].includes(
        blocker.code
      )
    );
    if (hardBlock) {
      throw new AppError(
        hardBlock.message,
        423,
        'SAFETY_RECOVERY_GUARD_ACTIVE',
        {
          blocker: hardBlock.code,
          retryAt: hardBlock.retryAt
        }
      );
    }
    await this.persistManualState(false, input.actorUserId, input.reason);
    this.whatsapp.resumeSending();
    return this.getSnapshot();
  }

  async reset(input: {
    actorUserId: string;
    reason: string;
  }) {
    const snapshot = await this.getSnapshot();
    if (!env.SAFETY_RESET_ENABLED) {
      throw new AppError(
        'Safety state reset is disabled by configuration',
        409,
        'SAFETY_RESET_DISABLED'
      );
    }
    if (!snapshot.recovery.resetEligible) {
      throw new AppError(
        'Safety state reset is not eligible while recovery guards are active',
        423,
        'SAFETY_RESET_GUARD_ACTIVE',
        {
          recoveryPhase: snapshot.recovery.phase,
          risk: snapshot.health.risk,
          timelockActive: snapshot.timelock.active
        }
      );
    }
    await this.persistManualState(true, input.actorUserId, input.reason);
    this.whatsapp.pauseSending();
    this.whatsapp.resetSafetyState();
    return this.getSnapshot();
  }

  async getSnapshot() {
    const protection = this.whatsapp.getProtectionSnapshot();
    const manualPaused = this.whatsapp.isSendingPaused();
    const recentDelays = await this.outbox
      .getRecentSafetyDelays(20)
      .catch(() => null);
    const capabilities: Record<
      string,
      { state: FeatureState; reason: string | null }
    > = {
      health: {
        state: protection ? 'enabled' : 'unavailable',
        reason: protection ? null : 'WhatsApp protection socket is unavailable'
      },
      warmup: {
        state: protection ? 'enabled' : 'unavailable',
        reason: protection ? null : 'WhatsApp protection socket is unavailable'
      },
      rates: {
        state: protection ? 'enabled' : 'unavailable',
        reason: protection ? null : 'WhatsApp protection socket is unavailable'
      },
      timelock: {
        state: protection ? 'enabled' : 'unavailable',
        reason: protection ? null : 'WhatsApp protection socket is unavailable'
      },
      recovery: {
        state: protection ? 'enabled' : 'unavailable',
        reason: protection ? null : 'WhatsApp protection socket is unavailable'
      },
      delivery: {
        state: protection ? 'enabled' : 'unavailable',
        reason: protection ? null : 'WhatsApp protection socket is unavailable'
      },
      retry: {
        state: protection?.stats.retryTracker ? 'enabled' : 'disabled',
        reason: protection?.stats.retryTracker
          ? null
          : 'Retry tracker is disabled by the active preset'
      },
      reconnect: {
        state: protection?.stats.reconnectThrottle ? 'enabled' : 'disabled',
        reason: protection?.stats.reconnectThrottle
          ? null
          : 'Reconnect throttle is disabled by the active preset'
      },
      sessionStability: {
        state: protection?.stats.sessionStability
          ? 'enabled'
          : 'not_instrumented',
        reason: protection?.stats.sessionStability
          ? null
          : 'No session stability event instrumentation is active'
      },
      delayTrace: {
        state: recentDelays ? 'enabled' : 'unavailable',
        reason: recentDelays ? null : 'Delay history query is unavailable'
      },
      reset: {
        state: env.SAFETY_RESET_ENABLED ? 'enabled' : 'disabled',
        reason: env.SAFETY_RESET_ENABLED
          ? null
          : 'SAFETY_RESET_ENABLED is false'
      },
      configMutation: {
        state: 'disabled',
        reason: 'Preset mutation remains feature-flagged pending config versioning'
      }
    };

    if (!protection) {
      const unavailable = {
        state: 'unavailable' as const,
        reason: 'Safety statistics are unavailable'
      };
      return {
        effectivePaused: true,
        manualPaused,
        mode: manualPaused ? ('manual_pause' as const) : ('unavailable' as const),
        blockers: [
          {
            code: 'SAFETY_UNAVAILABLE',
            source: 'system',
            message: 'Safety statistics are unavailable.',
            recommendation: 'Do not send until the WhatsApp protection socket is ready.',
            retryAt: null
          }
        ],
        health: {
          ...unavailable,
          risk: 'unknown' as const,
          score: null,
          autoPauseAt: null,
          reasons: ['Safety statistics are unavailable'],
          recommendation: 'Do not send until safety statistics are available.',
          stats: null
        },
        rates: { ...unavailable, minute: null, hour: null, day: null },
        warmup: { ...unavailable, data: null },
        timelock: { ...unavailable, active: null },
        recovery: {
          ...unavailable,
          phase: null,
          rateMultiplier: null,
          pauseRemainingMs: null,
          pauseUntil: null,
          estimatedFullRecoveryAt: null,
          recommendation: null,
          shouldReplaceNumber: null,
          resetEligible: false
        },
        delivery: { ...unavailable, data: null },
        retry: {
          state: capabilities.retry.state,
          reason: capabilities.retry.reason,
          data: null
        },
        reconnect: {
          state: capabilities.reconnect.state,
          reason: capabilities.reconnect.reason,
          data: null
        },
        sessionStability: {
          state: capabilities.sessionStability.state,
          reason: capabilities.sessionStability.reason,
          data: null
        },
        counters: null,
        recentDelays: recentDelays ?? [],
        config: {
          state: 'unavailable' as const,
          preset: 'conservative' as const,
          mutable: false,
          values: null
        },
        capabilities
      };
    }

    const { stats, config, timelock } = protection;
    const healthAutoPaused =
      riskOrder.indexOf(stats.health.risk) >=
      riskOrder.indexOf(config.autoPauseAt);
    const recovery = stats.banRecovery;
    const now = Date.now();
    const blockers: Array<{
      code: string;
      source: string;
      message: string;
      recommendation: string;
      retryAt: string | null;
    }> = [];
    const addBlocker = (
      code: SafetyReasonCode,
      source: string,
      retryAt: string | null = null
    ) => blockers.push({ ...safetyReasonCopy(code), source, retryAt });

    if (manualPaused) addBlocker('MANUAL_PAUSE', 'manual');
    if (healthAutoPaused) addBlocker('HEALTH_AUTO_PAUSE', 'health');
    if (recovery?.phase === 'paused') {
      addBlocker(
        'RECOVERY_PAUSED',
        'recovery',
        recovery.pauseRemainingMs
          ? new Date(now + recovery.pauseRemainingMs).toISOString()
          : null
      );
    }
    if (recovery?.phase === 'dead') addBlocker('RECOVERY_DEAD', 'recovery');
    if (timelock.isActive) {
      addBlocker(
        'TIMELOCK_ACTIVE',
        'timelock',
        timelock.expiresAt?.toISOString() ?? null
      );
    }
    if (stats.warmUp.todaySent >= stats.warmUp.todayLimit) {
      addBlocker('WARMUP_LIMIT', 'warmup');
    }
    const warmupLimited =
      stats.warmUp.todaySent >= stats.warmUp.todayLimit;
    const rateCountersClear =
      stats.rateLimiter.lastMinute === 0 &&
      stats.rateLimiter.lastHour === 0 &&
      stats.rateLimiter.lastDay === 0 &&
      stats.warmUp.todaySent === 0;
    const resetEligible =
      stats.health.risk === 'low' &&
      !timelock.isActive &&
      !['paused', 'dead'].includes(recovery?.phase ?? 'graduated') &&
      !recovery?.pauseRemainingMs &&
      rateCountersClear;

    return {
      effectivePaused:
        manualPaused ||
        healthAutoPaused ||
        recovery?.phase === 'paused' ||
        recovery?.phase === 'dead' ||
        warmupLimited,
      manualPaused,
      mode: manualPaused
        ? ('manual_pause' as const)
        : healthAutoPaused
          ? ('auto_pause' as const)
          : recovery?.phase === 'paused' || recovery?.phase === 'dead'
            ? ('recovery_pause' as const)
            : warmupLimited
              ? ('auto_pause' as const)
            : ('active' as const),
      blockers,
      health: {
        state: 'enabled' as const,
        reason: null,
        risk: stats.health.risk,
        score: stats.health.score,
        autoPauseAt: config.autoPauseAt,
        reasons: stats.health.reasons,
        recommendation: stats.health.recommendation,
        stats: stats.health.stats
      },
      rates: {
        state: 'enabled' as const,
        reason: null,
        minute: {
          used: stats.rateLimiter.lastMinute,
          limit: stats.rateLimiter.limits.perMinute,
          utilization: ratio(
            stats.rateLimiter.lastMinute,
            stats.rateLimiter.limits.perMinute
          )
        },
        hour: {
          used: stats.rateLimiter.lastHour,
          limit: stats.rateLimiter.limits.perHour,
          utilization: ratio(
            stats.rateLimiter.lastHour,
            stats.rateLimiter.limits.perHour
          )
        },
        day: {
          used: stats.rateLimiter.lastDay,
          limit: stats.rateLimiter.limits.perDay,
          utilization: ratio(
            stats.rateLimiter.lastDay,
            stats.rateLimiter.limits.perDay
          )
        }
      },
      warmup: {
        state: 'enabled' as const,
        reason: null,
        data: {
          day: stats.warmUp.day,
          totalDays: stats.warmUp.totalDays,
          sentToday: stats.warmUp.todaySent,
          limitToday: stats.warmUp.todayLimit,
          remainingToday: Math.max(
            0,
            stats.warmUp.todayLimit - stats.warmUp.todaySent
          ),
          progressRatio: Math.max(
            0,
            Math.min(1, stats.warmUp.progress / 100)
          )
        }
      },
      timelock: {
        state: 'enabled' as const,
        reason: null,
        active: timelock.isActive,
        enforcementType: timelock.enforcementType ?? null,
        detectedAt: timelock.detectedAt?.toISOString() ?? null,
        expiresAt: timelock.expiresAt?.toISOString() ?? null,
        errorCount: timelock.errorCount
      },
      recovery: {
        state: 'enabled' as const,
        reason: null,
        phase: recovery?.phase ?? 'graduated',
        rateMultiplier: recovery?.rateMultiplier ?? 1,
        pauseRemainingMs: recovery?.pauseRemainingMs ?? null,
        pauseUntil: recovery?.pauseRemainingMs
          ? new Date(now + recovery.pauseRemainingMs).toISOString()
          : null,
        estimatedFullRecoveryAt: recovery?.estimatedFullRecoveryDate
          ? new Date(recovery.estimatedFullRecoveryDate).toISOString()
          : null,
        recommendation:
          recovery?.recommendation ??
          'No active recovery — operating normally',
        shouldReplaceNumber: recovery?.shouldReplaceNumber ?? false,
        resetEligible
      },
      delivery: {
        state: 'enabled' as const,
        reason: null,
        data: {
          sentInWindow: stats.deliveryTracker.sentInWindow,
          deliveredInWindow: stats.deliveryTracker.deliveredInWindow,
          deliveryRate: stats.deliveryTracker.deliveryRate,
          sampleState:
            stats.deliveryTracker.deliveryRate === null
              ? ('insufficient_sample' as const)
              : ('available' as const),
          windowMs: stats.deliveryTracker.windowMs
        }
      },
      retry: {
        state: capabilities.retry.state,
        reason: capabilities.retry.reason,
        data: stats.retryTracker ?? null
      },
      reconnect: {
        state: capabilities.reconnect.state,
        reason: capabilities.reconnect.reason,
        data: stats.reconnectThrottle ?? null
      },
      sessionStability: {
        state: capabilities.sessionStability.state,
        reason: capabilities.sessionStability.reason,
        data: stats.sessionStability ?? null
      },
      counters: {
        messagesAllowed: stats.messagesAllowed,
        messagesBlocked: stats.messagesBlocked,
        totalDelayMs: stats.totalDelayMs
      },
      recentDelays: recentDelays ?? [],
      config: {
        state: 'enabled' as const,
        preset: 'conservative' as const,
        mutable: false,
        values: {
          perMinute: config.maxPerMinute,
          perHour: config.maxPerHour,
          perDay: config.maxPerDay,
          minDelayMs: config.minDelayMs,
          maxDelayMs: config.maxDelayMs,
          newChatDelayMs: config.newChatDelayMs,
          warmupDays: config.warmupDays,
          autoPauseAt: config.autoPauseAt
        }
      },
      capabilities
    };
  }

  async getPrometheusMetrics(): Promise<string> {
    const snapshot = await this.getSnapshot();
    const lines = [
      '# HELP control_panel_safety_available Whether safety stats are available',
      '# TYPE control_panel_safety_available gauge',
      `control_panel_safety_available ${snapshot.health.state === 'enabled' ? 1 : 0}`,
      '# HELP control_panel_safety_effective_paused Whether sending is effectively paused',
      '# TYPE control_panel_safety_effective_paused gauge',
      `control_panel_safety_effective_paused ${snapshot.effectivePaused ? 1 : 0}`
    ];
    if (snapshot.health.state === 'enabled') {
      const riskMap = { low: 0, medium: 1, high: 2, critical: 3 } as const;
      lines.push(
        '# HELP control_panel_safety_health_score Health score from 0 to 100',
        '# TYPE control_panel_safety_health_score gauge',
        `control_panel_safety_health_score ${snapshot.health.score}`,
        '# HELP control_panel_safety_risk Risk level 0=low 1=medium 2=high 3=critical',
        '# TYPE control_panel_safety_risk gauge',
        `control_panel_safety_risk ${riskMap[snapshot.health.risk as keyof typeof riskMap]}`,
        '# HELP control_panel_safety_warmup_progress_ratio Warm-up progress from 0 to 1',
        '# TYPE control_panel_safety_warmup_progress_ratio gauge',
        `control_panel_safety_warmup_progress_ratio ${snapshot.warmup.data!.progressRatio}`,
        '# HELP control_panel_safety_rate_utilization Rate utilization from 0 to 1',
        '# TYPE control_panel_safety_rate_utilization gauge',
        `control_panel_safety_rate_utilization{window="minute"} ${snapshot.rates.minute!.utilization}`,
        `control_panel_safety_rate_utilization{window="hour"} ${snapshot.rates.hour!.utilization}`,
        `control_panel_safety_rate_utilization{window="day"} ${snapshot.rates.day!.utilization}`
      );
    }
    return `${lines.join('\n')}\n`;
  }

  private async persistManualState(
    paused: boolean,
    actorUserId: string,
    reason: string
  ): Promise<void> {
    await this.database.query(
      `
        INSERT INTO safety_control_state (
          singleton,
          manual_paused,
          reason,
          changed_by,
          updated_at
        )
        VALUES (TRUE, $1, $2, $3::uuid, NOW())
        ON CONFLICT (singleton)
        DO UPDATE SET
          manual_paused = EXCLUDED.manual_paused,
          reason = EXCLUDED.reason,
          changed_by = EXCLUDED.changed_by,
          updated_at = NOW();
      `,
      [paused, reason, actorUserId]
    );
  }
}
