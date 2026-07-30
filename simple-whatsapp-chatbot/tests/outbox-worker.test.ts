import {
  OutboxWorker
} from '../src/services/outbox-worker.service.js';
import type {
  ClaimedOutboxItem,
  OutboxService
} from '../src/services/outbox.service.js';

const item: ClaimedOutboxItem = {
  outboxId: '2ddb725d-56c0-4708-8d81-1b868a3e8bd9',
  messageId: '91',
  logicalMessageId: '59942ce7-4f15-4a8b-9448-a98f39d70d10',
  jid: '6281234567890@s.whatsapp.net',
  text: 'Halo',
  attempt: 1,
  maxAttempts: 3
};

const createHarness = (options: {
  status?: 'connecting' | 'connected' | 'disconnected';
  paused?: boolean;
  sendError?: Error;
} = {}) => {
  const outbox = {
    claimNext: vi.fn(async () => item),
    complete: vi.fn(async () => undefined),
    defer: vi.fn(async () => undefined),
    deferNextForSafety: vi.fn(async () => true),
    markUnknown: vi.fn(async () => undefined)
  } as unknown as OutboxService;
  const sender = {
    getStatus: vi.fn(() => options.status ?? 'connected'),
    isSendingPaused: vi.fn(() => options.paused ?? false),
    sendText: vi.fn(async () => {
      if (options.sendError) throw options.sendError;
      return { key: { id: 'provider-91' } };
    })
  };
  const worker = new OutboxWorker(outbox, sender, {
    pollIntervalMs: 10_000,
    leaseMs: 30_000,
    retryBaseMs: 100
  });
  return { worker, outbox, sender };
};

describe('OutboxWorker delivery safety', () => {
  it('sends a claimed message once and persists provider acceptance', async () => {
    const { worker, outbox, sender } = createHarness();

    await worker.tick();

    expect(sender.sendText).toHaveBeenCalledOnce();
    expect(outbox.complete).toHaveBeenCalledWith(item, 'provider-91');
    expect(outbox.markUnknown).not.toHaveBeenCalled();
  });

  it('marks an ambiguous provider error unknown instead of blind retrying', async () => {
    const providerError = new Error('socket closed after write');
    const { worker, outbox } = createHarness({ sendError: providerError });

    await worker.tick();

    expect(outbox.markUnknown).toHaveBeenCalledWith(item, providerError);
    expect(outbox.defer).not.toHaveBeenCalled();
  });

  it('uses backoff without a provider call while WhatsApp is disconnected', async () => {
    const { worker, outbox, sender } = createHarness({
      status: 'disconnected'
    });

    await worker.tick();

    expect(sender.sendText).not.toHaveBeenCalled();
    expect(outbox.defer).toHaveBeenCalledWith(
      item,
      'WHATSAPP_NOT_READY',
      100
    );
  });

  it('records a traceable safety delay without leasing while paused', async () => {
    const { worker, outbox, sender } = createHarness({ paused: true });

    await worker.tick();

    expect(outbox.claimNext).not.toHaveBeenCalled();
    expect(sender.sendText).not.toHaveBeenCalled();
    expect(outbox.deferNextForSafety).toHaveBeenCalledWith(
      'MANUAL_PAUSE',
      30_000,
      expect.objectContaining({ code: 'MANUAL_PAUSE' })
    );
  });

  it('classifies an anti-ban block as safety-delayed instead of unknown', async () => {
    const policyError = new Error(
      '[baileys-antiban] Message blocked: Warm-up limit reached'
    );
    const { worker, outbox } = createHarness({ sendError: policyError });

    await worker.tick();

    expect(outbox.defer).toHaveBeenCalledWith(
      item,
      'WARMUP_LIMIT',
      30_000,
      true,
      expect.objectContaining({ code: 'WARMUP_LIMIT' })
    );
    expect(outbox.markUnknown).not.toHaveBeenCalled();
  });
});
