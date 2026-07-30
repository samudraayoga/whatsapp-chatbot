import type { OverviewResponse } from '../api/contracts';

const generatedAt = '2026-07-30T03:00:00.000Z';

export const healthyOverview: OverviewResponse = {
  data: {
    readiness: {
      readyToSend: true,
      blockers: [],
      database: 'connected',
      eventStream: 'connected'
    },
    session: {
      state: 'connected',
      connectedSince: '2026-07-30T01:12:00.000Z',
      lastDisconnect: null,
      reconnect: {
        attempt: 0,
        nextRetryAt: null,
        eligible: false,
        disabledReason: 'already_connected'
      },
      browser: {
        platform: 'Ubuntu',
        name: 'Simple WhatsApp Chatbot'
      },
      credentialUpdatedAt: '2026-07-30T01:11:30.000Z'
    },
    safety: {
      risk: 'low',
      score: 4,
      paused: false,
      reasons: ['Tidak ada masalah yang terdeteksi'],
      recommendation: 'Operasi normal. Lanjutkan pemantauan.'
    },
    rates: {
      minute: { used: 2, limit: 5 },
      hour: { used: 32, limit: 100 },
      day: { used: 218, limit: 800 }
    },
    warmup: {
      day: 6,
      totalDays: 10,
      sentToday: 38,
      limitToday: 283,
      progressRatio: 0.5
    },
    outbox: {
      queued: 3,
      retrying: 1,
      failed: 0,
      oldestAgeMs: 42_000
    },
    followUp: {
      open: 7,
      unassigned: 2,
      overdue: 1
    },
    capabilities: {
      safety: 'enabled',
      outbox: 'enabled',
      followUp: 'enabled',
      eventStream: 'enabled'
    },
    recentEvents: []
  },
  meta: {
    requestId: 'req_mock_healthy',
    generatedAt
  }
};

export const qrRequiredOverview: OverviewResponse = {
  ...healthyOverview,
  data: {
    ...healthyOverview.data,
    readiness: {
      ...healthyOverview.data.readiness,
      readyToSend: false,
      blockers: ['qr_required']
    },
    session: {
      ...healthyOverview.data.session,
      state: 'qr_required',
      connectedSince: null,
      reconnect: {
        attempt: 0,
        nextRetryAt: null,
        eligible: false,
        disabledReason: 'pairing_required'
      },
      credentialUpdatedAt: null
    }
  },
  meta: {
    requestId: 'req_mock_qr',
    generatedAt
  }
};

export const highRiskOverview: OverviewResponse = {
  ...healthyOverview,
  data: {
    ...healthyOverview.data,
    readiness: {
      ...healthyOverview.data.readiness,
      readyToSend: false,
      blockers: ['health_auto_pause']
    },
    session: {
      ...healthyOverview.data.session,
      state: 'paused',
      reconnect: {
        attempt: 0,
        nextRetryAt: null,
        eligible: false,
        disabledReason: 'sending_paused'
      }
    },
    safety: {
      risk: 'high',
      score: 62,
      paused: true,
      reasons: ['Terlalu banyak disconnect dalam satu jam'],
      recommendation: 'Hentikan pengiriman dan periksa stabilitas session.'
    }
  },
  meta: {
    requestId: 'req_mock_high_risk',
    generatedAt
  }
};

export const databaseDownOverview: OverviewResponse = {
  ...healthyOverview,
  data: {
    ...healthyOverview.data,
    readiness: {
      ...healthyOverview.data.readiness,
      readyToSend: false,
      blockers: ['database_unavailable'],
      database: 'disconnected'
    }
  },
  meta: {
    requestId: 'req_mock_database_down',
    generatedAt
  }
};

export const disconnectedOverview: OverviewResponse = {
  ...healthyOverview,
  data: {
    ...healthyOverview.data,
    readiness: {
      ...healthyOverview.data.readiness,
      readyToSend: false,
      blockers: ['whatsapp_disconnected']
    },
    session: {
      ...healthyOverview.data.session,
      state: 'disconnected',
      connectedSince: null,
      lastDisconnect: {
        code: 408,
        reason: 'Connection timed out',
        classification: 'recoverable',
        occurredAt: '2026-07-30T02:58:00.000Z'
      },
      reconnect: {
        attempt: 0,
        nextRetryAt: null,
        eligible: true,
        disabledReason: null
      }
    }
  },
  meta: {
    requestId: 'req_mock_disconnected',
    generatedAt
  }
};

export const overviewScenarios = {
  healthy: healthyOverview,
  qr_required: qrRequiredOverview,
  high_risk: highRiskOverview,
  database_down: databaseDownOverview,
  disconnected: disconnectedOverview
} as const;

export type OverviewScenario = keyof typeof overviewScenarios;
