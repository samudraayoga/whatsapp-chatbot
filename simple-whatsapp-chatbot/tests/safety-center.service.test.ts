import { SafetyCenterService } from '../src/services/safety-center.service.js';

const actorUserId = '2a99543d-80d5-47a0-92ef-a389ce1a3001';

const protectionSnapshot = (overrides: Record<string, unknown> = {}) => ({
  config: {
    maxPerMinute: 5,
    maxPerHour: 100,
    maxPerDay: 800,
    minDelayMs: 2500,
    maxDelayMs: 7000,
    newChatDelayMs: 4000,
    warmupDays: 10,
    autoPauseAt: 'high'
  },
  timelock: {
    isActive: false,
    errorCount: 0
  },
  stats: {
    health: {
      risk: 'low',
      score: 8,
      reasons: [],
      recommendation: 'Operate normally',
      stats: {
        disconnectsLastHour: 0,
        failedMessagesLastHour: 0,
        forbiddenErrors: 0,
        timelockErrors: 0,
        uptimeMs: 10_000
      }
    },
    rateLimiter: {
      lastMinute: 1,
      lastHour: 12,
      lastDay: 80,
      limits: { perMinute: 5, perHour: 100, perDay: 800 }
    },
    warmUp: {
      day: 2,
      totalDays: 10,
      todaySent: 4,
      todayLimit: 20,
      progress: 20
    },
    banRecovery: {
      phase: 'graduated',
      rateMultiplier: 1,
      pauseRemainingMs: null,
      recommendation: 'Operate normally',
      shouldReplaceNumber: false
    },
    deliveryTracker: {
      sentInWindow: 1,
      deliveredInWindow: 0,
      deliveryRate: null,
      windowMs: 3_600_000
    },
    retryTracker: null,
    reconnectThrottle: null,
    sessionStability: null,
    messagesAllowed: 4,
    messagesBlocked: 1,
    totalDelayMs: 5000
  },
  ...overrides
});

const createHarness = (input: {
  protection?: ReturnType<typeof protectionSnapshot> | null;
  paused?: boolean;
} = {}) => {
  let paused = input.paused ?? false;
  let protection =
    input.protection === undefined ? protectionSnapshot() : input.protection;
  const database = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('SELECT manual_paused')) {
        return { rows: [{ manual_paused: true }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    })
  };
  const whatsapp = {
    getProtectionSnapshot: vi.fn(() => protection),
    isSendingPaused: vi.fn(() => paused),
    pauseSending: vi.fn(() => {
      paused = true;
    }),
    resumeSending: vi.fn(() => {
      paused = false;
    }),
    restoreManualPause: vi.fn((value: boolean) => {
      paused = value;
    }),
    resetSafetyState: vi.fn(),
    setProtection: (value: ReturnType<typeof protectionSnapshot>) => {
      protection = value;
    }
  };
  const outbox = {
    getRecentSafetyDelays: vi.fn(async () => [])
  };
  const service = new SafetyCenterService(
    whatsapp as never,
    outbox as never,
    database as never
  );
  return { service, whatsapp, outbox, database };
};

describe('SafetyCenterService', () => {
  it('maps high health risk into an automatic pause with operator guidance', async () => {
    const base = protectionSnapshot();
    const { service } = createHarness({
      protection: protectionSnapshot({
        stats: {
          ...base.stats,
          health: {
            ...base.stats.health,
            risk: 'high',
            score: 72,
            reasons: ['Disconnect frequency increased']
          }
        }
      })
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot).toMatchObject({
      effectivePaused: true,
      manualPaused: false,
      mode: 'auto_pause',
      health: { risk: 'high', score: 72 }
    });
    expect(snapshot.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'HEALTH_AUTO_PAUSE',
          message: expect.any(String),
          recommendation: expect.any(String)
        })
      ])
    );
  });

  it('keeps disabled and uninstrumented modules nullable instead of zero', async () => {
    const { service } = createHarness();
    const snapshot = await service.getSnapshot();

    expect(snapshot.retry).toMatchObject({ state: 'disabled', data: null });
    expect(snapshot.reconnect).toMatchObject({
      state: 'disabled',
      data: null
    });
    expect(snapshot.sessionStability).toMatchObject({
      state: 'not_instrumented',
      data: null
    });
    expect(snapshot.delivery.data).toMatchObject({
      deliveryRate: null,
      sampleState: 'insufficient_sample'
    });
  });

  it('treats an exhausted warm-up budget as an effective automatic pause', async () => {
    const base = protectionSnapshot();
    const { service } = createHarness({
      protection: protectionSnapshot({
        stats: {
          ...base.stats,
          warmUp: {
            ...base.stats.warmUp,
            todaySent: 20,
            todayLimit: 20
          }
        }
      })
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot).toMatchObject({
      effectivePaused: true,
      mode: 'auto_pause',
      recovery: { resetEligible: false }
    });
    expect(snapshot.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'WARMUP_LIMIT' })
      ])
    );
  });

  it('blocks resume while recovery is paused and does not persist a resume', async () => {
    const base = protectionSnapshot();
    const { service, database, whatsapp } = createHarness({
      paused: true,
      protection: protectionSnapshot({
        stats: {
          ...base.stats,
          banRecovery: {
            ...base.stats.banRecovery,
            phase: 'paused',
            pauseRemainingMs: 120_000
          }
        }
      })
    });

    await expect(
      service.resume({
        actorUserId,
        reason: 'Incident has been reviewed'
      })
    ).rejects.toMatchObject({
      statusCode: 423,
      code: 'SAFETY_RECOVERY_GUARD_ACTIVE'
    });
    expect(database.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO safety_control_state'),
      expect.anything()
    );
    expect(whatsapp.resumeSending).not.toHaveBeenCalled();
  });

  it('restores a persisted manual pause after restart', async () => {
    const { service, whatsapp } = createHarness();

    await service.restoreManualState();

    expect(whatsapp.restoreManualPause).toHaveBeenCalledWith(true);
    expect((await service.getSnapshot()).manualPaused).toBe(true);
  });

  it('persists the admin reason before resuming', async () => {
    const { service, database, whatsapp } = createHarness({ paused: true });

    await service.resume({
      actorUserId,
      reason: 'Health is low and the incident has been reviewed'
    });

    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO safety_control_state'),
      [
        false,
        'Health is low and the incident has been reviewed',
        actorUserId
      ]
    );
    expect(whatsapp.resumeSending).toHaveBeenCalledOnce();
  });

  it('keeps safety reset disabled by default', async () => {
    const { service, whatsapp } = createHarness();

    await expect(
      service.reset({
        actorUserId,
        reason: 'Controlled maintenance after incident review'
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'SAFETY_RESET_DISABLED'
    });
    expect(whatsapp.resetSafetyState).not.toHaveBeenCalled();
  });
});
