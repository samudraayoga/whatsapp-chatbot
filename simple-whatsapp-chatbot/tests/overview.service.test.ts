import type { OperationalEventService } from '../src/services/operational-event.service.js';
import { OverviewService } from '../src/services/overview.service.js';
import type { WhatsAppService } from '../src/services/whatsapp.service.js';

const connectedSession = {
  state: 'connected' as const,
  connectedSince: '2026-07-30T03:00:00.000Z',
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
  credentialUpdatedAt: null
};

describe('OverviewService Sprint 2 readiness', () => {
  it('blocks readiness for a manual pause without inventing unavailable metrics', async () => {
    const whatsapp = {
      getOperationalStatus: vi.fn(() => connectedSession),
      getProtectionSnapshot: vi.fn(() => null),
      isSendingPaused: vi.fn(() => true)
    } as unknown as WhatsAppService;
    const events = {
      listRecent: vi.fn(async () => [])
    } as unknown as OperationalEventService;
    const service = new OverviewService(whatsapp, async () => true, events);

    const result = await service.getOverview();

    expect(result.readiness).toMatchObject({
      readyToSend: false,
      database: 'connected',
      eventStream: 'connected'
    });
    expect(result.readiness.blockers).toContain('manual_pause');
    expect(result.safety.paused).toBe(true);
    expect(result.safety.score).toBeNull();
    expect(result.rates.minute).toBeNull();
    expect(result.capabilities.eventStream).toBe('enabled');
  });

  it('reports database failure independently from a connected WhatsApp session', async () => {
    const whatsapp = {
      getOperationalStatus: vi.fn(() => connectedSession),
      getProtectionSnapshot: vi.fn(() => null),
      isSendingPaused: vi.fn(() => false)
    } as unknown as WhatsAppService;
    const service = new OverviewService(whatsapp, async () => false);

    const result = await service.getOverview();

    expect(result.session.state).toBe('connected');
    expect(result.readiness.database).toBe('disconnected');
    expect(result.readiness.blockers).toContain('database_unavailable');
  });

  it('uses the worker sending blocks for recovery-dead and warm-up readiness', async () => {
    const whatsapp = {
      getOperationalStatus: vi.fn(() => connectedSession),
      getProtectionSnapshot: vi.fn(() => null),
      isSendingPaused: vi.fn(() => false),
      getSendingBlocks: vi.fn(() => [
        { code: 'RECOVERY_DEAD', retryAfterMs: 60_000 },
        { code: 'WARMUP_LIMIT', retryAfterMs: 60_000 }
      ])
    } as unknown as WhatsAppService;
    const events = {
      listRecent: vi.fn(async () => [])
    } as unknown as OperationalEventService;
    const service = new OverviewService(whatsapp, async () => true, events);

    const result = await service.getOverview();

    expect(result.readiness.readyToSend).toBe(false);
    expect(result.readiness.blockers).toEqual(
      expect.arrayContaining(['recovery_dead', 'warmup_limit'])
    );
  });
});
