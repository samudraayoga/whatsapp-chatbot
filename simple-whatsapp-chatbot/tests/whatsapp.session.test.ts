import { Boom } from '@hapi/boom';
import type { ConnectionState } from '@whiskeysockets/baileys';
import type { ChatbotService } from '../src/services/chatbot.service.js';
import type { MessageService } from '../src/services/message.service.js';
import type { OperationalEventService } from '../src/services/operational-event.service.js';
import {
  PAIRING_QR_TTL_MS,
  WhatsAppService
} from '../src/services/whatsapp.service.js';

type SessionHarness = {
  handleConnectionUpdate(update: Partial<ConnectionState>): Promise<void>;
};

const createService = () => {
  const operationalEvents = {
    publish: vi.fn()
  } as unknown as OperationalEventService;
  const service = new WhatsAppService(
    {} as ChatbotService,
    {} as MessageService,
    operationalEvents
  );
  const harness = service as unknown as SessionHarness;

  return { service, harness, operationalEvents };
};

describe('WhatsApp rich session lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the pairing QR in memory, expires it, and never publishes its value', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T03:00:00.000Z'));
    const { service, harness, operationalEvents } = createService();
    const rawQr = 'secret-pairing-value';

    await harness.handleConnectionUpdate({ qr: rawQr });

    expect(service.getOperationalStatus().state).toBe('qr_required');
    expect(service.getPairingQr()).toMatchObject({ qr: rawQr });
    expect(JSON.stringify(vi.mocked(operationalEvents.publish).mock.calls)).not.toContain(
      rawQr
    );

    await vi.advanceTimersByTimeAsync(PAIRING_QR_TTL_MS);
    expect(service.getPairingQr()).toBeNull();
  });

  it('clears a pairing QR immediately after connection opens', async () => {
    vi.useFakeTimers();
    const { service, harness } = createService();

    await harness.handleConnectionUpdate({ qr: 'temporary-qr' });
    await harness.handleConnectionUpdate({ connection: 'open' });

    expect(service.getOperationalStatus().state).toBe('connected');
    expect(service.getPairingQr()).toBeNull();
  });

  it('keeps only one reconnect timer for repeated recoverable disconnects', async () => {
    vi.useFakeTimers();
    const { service, harness } = createService();
    const error = new Boom('Timed out', { statusCode: 408 });

    await harness.handleConnectionUpdate({
      connection: 'close',
      lastDisconnect: { error, date: new Date() }
    });
    await harness.handleConnectionUpdate({
      connection: 'close',
      lastDisconnect: { error, date: new Date() }
    });

    const status = service.getOperationalStatus();
    expect(status.state).toBe('reconnecting');
    expect(status.reconnect.attempt).toBe(1);
    expect(status.reconnect.eligible).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each([
    [401, 'logged_out'],
    [500, 'bad_session']
  ] as const)(
    'classifies terminal disconnect %s as %s without a reconnect loop',
    async (statusCode, expectedState) => {
      vi.useFakeTimers();
      const { service, harness } = createService();

      await harness.handleConnectionUpdate({
        connection: 'close',
        lastDisconnect: {
          error: new Boom('Terminal session', { statusCode }),
          date: new Date()
        }
      });

      expect(service.getOperationalStatus().state).toBe(expectedState);
      expect(service.getOperationalStatus().reconnect.eligible).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('cancels a pending retry if a later disconnect is terminal', async () => {
    vi.useFakeTimers();
    const { service, harness } = createService();
    await harness.handleConnectionUpdate({
      connection: 'close',
      lastDisconnect: {
        error: new Boom('Timed out', { statusCode: 408 }),
        date: new Date()
      }
    });
    expect(vi.getTimerCount()).toBe(1);

    await harness.handleConnectionUpdate({
      connection: 'close',
      lastDisconnect: {
        error: new Boom('Logged out', { statusCode: 401 }),
        date: new Date()
      }
    });

    expect(service.getOperationalStatus().state).toBe('logged_out');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('blocks new sends immediately after an emergency pause', async () => {
    const { service } = createService();

    service.pauseSending();

    expect(service.isSendingPaused()).toBe(true);
    await expect(
      service.sendText('6281234567890@s.whatsapp.net', 'test')
    ).rejects.toThrow('WhatsApp sending is paused');
  });
});
