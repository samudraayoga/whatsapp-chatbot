import type { SafetyCenterResponse } from '../api/contracts';

export const mockSafetyCenter: SafetyCenterResponse = {
  data: {
    effectivePaused: true,
    manualPaused: false,
    mode: 'auto_pause',
    blockers: [
      {
        code: 'HEALTH_AUTO_PAUSE',
        source: 'health',
        message: 'Pengiriman otomatis dihentikan karena risiko mencapai ambang.',
        recommendation:
          'Tinjau penyebab health, tunggu risiko turun, lalu minta admin melakukan resume.',
        retryAt: '2026-07-30T08:02:00.000Z'
      }
    ],
    health: {
      state: 'enabled',
      reason: null,
      risk: 'high',
      score: 74,
      autoPauseAt: 'high',
      reasons: ['Disconnect frequency increased', 'Delivery sample degraded'],
      recommendation: 'Pause sending and inspect connection stability.',
      stats: {
        disconnectsLastHour: 4,
        failedMessagesLastHour: 3,
        forbiddenErrors: 0,
        timelockErrors: 0,
        uptimeMs: 7200000
      }
    },
    rates: {
      state: 'enabled',
      reason: null,
      minute: { used: 4, limit: 5, utilization: 0.8 },
      hour: { used: 41, limit: 100, utilization: 0.41 },
      day: { used: 190, limit: 800, utilization: 0.2375 }
    },
    warmup: {
      state: 'enabled',
      reason: null,
      data: {
        day: 4,
        totalDays: 10,
        sentToday: 17,
        limitToday: 30,
        remainingToday: 13,
        progressRatio: 0.4
      }
    },
    timelock: {
      state: 'enabled',
      reason: null,
      active: false,
      enforcementType: null,
      detectedAt: null,
      expiresAt: null,
      errorCount: 0
    },
    recovery: {
      state: 'enabled',
      reason: null,
      phase: 'cooldown',
      rateMultiplier: 0.5,
      pauseRemainingMs: null,
      pauseUntil: null,
      estimatedFullRecoveryAt: '2026-08-01T08:00:00.000Z',
      recommendation: 'Keep volume low until recovery graduates.',
      shouldReplaceNumber: false,
      resetEligible: false
    },
    delivery: {
      state: 'enabled',
      reason: null,
      data: {
        sentInWindow: 12,
        deliveredInWindow: 9,
        deliveryRate: 0.75,
        sampleState: 'available',
        windowMs: 3600000
      }
    },
    retry: {
      state: 'disabled',
      reason: 'Retry tracker is disabled by the active preset',
      data: null
    },
    reconnect: {
      state: 'disabled',
      reason: 'Reconnect throttle is disabled by the active preset',
      data: null
    },
    sessionStability: {
      state: 'not_instrumented',
      reason: 'No session stability event instrumentation is active',
      data: null
    },
    counters: {
      messagesAllowed: 190,
      messagesBlocked: 8,
      totalDelayMs: 148000
    },
    recentDelays: [
      {
        id: '101',
        messageId: '59942ce7-4f15-4a8b-9448-a98f39d70d10',
        outboxId: '2ddb725d-56c0-4708-8d81-1b868a3e8bd9',
        reasonCode: 'HEALTH_AUTO_PAUSE',
        message: 'Pesan ditunda karena safety health sedang high.',
        recommendation: 'Tunggu health turun sebelum melanjutkan.',
        nextAttemptInMs: 60000,
        occurredAt: '2026-07-30T08:01:00.000Z'
      }
    ],
    config: {
      state: 'enabled',
      preset: 'conservative',
      mutable: false,
      values: {
        perMinute: 5,
        perHour: 100,
        perDay: 800,
        minDelayMs: 2500,
        maxDelayMs: 7000,
        newChatDelayMs: 4000,
        warmupDays: 10,
        autoPauseAt: 'high'
      }
    },
    capabilities: {
      health: { state: 'enabled', reason: null },
      warmup: { state: 'enabled', reason: null },
      rates: { state: 'enabled', reason: null },
      timelock: { state: 'enabled', reason: null },
      recovery: { state: 'enabled', reason: null },
      delivery: { state: 'enabled', reason: null },
      retry: {
        state: 'disabled',
        reason: 'Retry tracker is disabled by the active preset'
      },
      reconnect: {
        state: 'disabled',
        reason: 'Reconnect throttle is disabled by the active preset'
      },
      sessionStability: {
        state: 'not_instrumented',
        reason: 'No session stability event instrumentation is active'
      },
      delayTrace: { state: 'enabled', reason: null },
      reset: {
        state: 'disabled',
        reason: 'SAFETY_RESET_ENABLED is false'
      },
      configMutation: {
        state: 'disabled',
        reason: 'Preset mutation remains feature-flagged'
      }
    }
  },
  meta: {
    requestId: 'req_mock_safety_center',
    generatedAt: '2026-07-30T08:01:10.000Z'
  }
};
