import { Boom } from '@hapi/boom';
import type { ConnectionState, WAMessage } from '@whiskeysockets/baileys';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ChatbotService } from '../src/services/chatbot.service.js';
import type { MessageService } from '../src/services/message.service.js';
import type { OperationalEventService } from '../src/services/operational-event.service.js';
import type { AiRagRuntimeService, RagResult } from '../src/services/ai-rag-runtime.service.js';
import type { OutboxService } from '../src/services/outbox.service.js';
import {
  PAIRING_QR_TTL_MS,
  WhatsAppService
} from '../src/services/whatsapp.service.js';

type SessionHarness = {
  handleConnectionUpdate(update: Partial<ConnectionState>): Promise<void>;
  status: 'connecting' | 'connected' | 'disconnected';
  operationalState:
    | 'starting'
    | 'connecting'
    | 'qr_required'
    | 'connected'
    | 'reconnecting'
    | 'paused'
    | 'logged_out'
    | 'bad_session'
    | 'disconnected'
    | 'shutting_down';
  connectedSince: string | null;
  socket: {
    ev: { removeAllListeners(event: string): void };
    ws: { close(): Promise<void> };
  } | null;
  startSocket(): Promise<void>;
  processIncomingMessage(message: WAMessage): Promise<void>;
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

  it('expires each pairing QR after ten seconds', () => {
    expect(PAIRING_QR_TTL_MS).toBe(10_000);
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

  it('uses the menu rule for a greeting on a contact first message', async () => {
    const chatbotService = {
      evaluate: vi.fn(async () => ({
        versionId: '3ca59c93-89f4-4c34-bb27-7d9e0887781b',
        revision: 7,
        normalizedInput: '',
        matchedRule: {
          id: 'ec53bfd2-a990-4e1a-866c-45145ee96c93',
          triggerType: 'empty',
          priority: 900,
          matchedTrigger: null,
          action: 'reply'
        },
        response: 'Sapaan aktif dari konfigurasi chatbot'
      }))
    } as unknown as ChatbotService;
    const messageService = {
      saveMessage: vi
        .fn()
        .mockResolvedValueOnce({ inserted: true, isFirstIncoming: true })
        .mockResolvedValueOnce({ inserted: true, isFirstIncoming: false }),
      applyChatbotEvaluation: vi.fn(async () => undefined)
    } as unknown as MessageService;
    const service = new WhatsAppService(chatbotService, messageService);
    const sendText = vi.spyOn(service, 'sendText').mockResolvedValue({
      key: { id: 'outgoing-message-id' }
    } as WAMessage);
    const remoteJid = '6281234567890@s.whatsapp.net';

    await (service as unknown as SessionHarness).processIncomingMessage({
      key: {
        id: 'incoming-message-id',
        remoteJid,
        fromMe: false
      },
      message: { conversation: 'Halo' },
      pushName: 'Rina'
    } as WAMessage);

    expect(chatbotService.evaluate).toHaveBeenCalledWith('menu');
    expect(sendText).toHaveBeenCalledWith(
      remoteJid,
      'Sapaan aktif dari konfigurasi chatbot'
    );
    expect(messageService.saveMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        direction: 'outgoing',
        content: 'Sapaan aktif dari konfigurasi chatbot'
      })
    );
  });

  it('routes an ordinary WhatsApp question to AI and queues exactly one response', async () => {
    const chatbotService = {
      evaluate: vi.fn()
    } as unknown as ChatbotService;
    const messageService = {
      saveMessage: vi.fn(async () => ({ inserted: true, isFirstIncoming: true })),
      applyChatbotEvaluation: vi.fn()
    } as unknown as MessageService;
    const result = {
      reply: 'RAHO Premier adalah layanan premium RAHO.',
      traceId: 'ai-trace-1',
      answerStatus: 'supported',
      validationStatus: 'validated',
      usedKnowledge: [{ chunkId: 'chunk-1' }],
      handoff: false
    } as unknown as RagResult;
    const aiRuntime = {
      respond: vi.fn(async () => result)
    } as unknown as AiRagRuntimeService;
    const outbox = {
      queueAutomatedResponse: vi.fn(async () => ({
        messageId: '2',
        outboxId: '4b7f494c-97e7-4d85-8a20-4638ed76e7ac',
        queued: true
      }))
    } as unknown as OutboxService;
    const service = new WhatsAppService(
      chatbotService,
      messageService,
      undefined,
      aiRuntime,
      outbox,
      '00000000-0000-4000-8000-000000000001'
    );

    await (service as unknown as SessionHarness).processIncomingMessage({
      key: {
        id: 'incoming-ai-message',
        remoteJid: '6281234567890@s.whatsapp.net',
        fromMe: false
      },
      message: { conversation: 'Apa itu RAHO Premier?' },
      pushName: 'Rina'
    } as WAMessage);

    expect(aiRuntime.respond).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'whatsapp',
      providerMessageId: 'incoming-ai-message',
      message: 'Apa itu RAHO Premier?',
      requireActiveIntegration: true
    }));
    expect(chatbotService.evaluate).not.toHaveBeenCalled();
    expect(outbox.queueAutomatedResponse).toHaveBeenCalledOnce();
    expect(outbox.queueAutomatedResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        responseProviderMessageId: 'incoming-ai-message:ai',
        text: result.reply,
        source: 'ai'
      })
    );
  });

  it('falls back to the legacy response queue when AI fails', async () => {
    const chatbotService = {
      evaluate: vi.fn(async () => ({
        versionId: '3ca59c93-89f4-4c34-bb27-7d9e0887781b',
        revision: 7,
        normalizedInput: 'pertanyaan baru',
        matchedRule: {
          id: 'ec53bfd2-a990-4e1a-866c-45145ee96c93',
          triggerType: 'fallback',
          priority: 1000,
          matchedTrigger: null,
          action: 'reply'
        },
        response: 'Maaf, informasi belum tersedia. Balas 0 untuk Admin.'
      }))
    } as unknown as ChatbotService;
    const messageService = {
      saveMessage: vi.fn(async () => ({ inserted: true, isFirstIncoming: false })),
      applyChatbotEvaluation: vi.fn(async () => undefined)
    } as unknown as MessageService;
    const aiRuntime = {
      respond: vi.fn(async () => { throw new Error('provider unavailable'); })
    } as unknown as AiRagRuntimeService;
    const outbox = {
      queueAutomatedResponse: vi.fn(async () => ({
        messageId: '3',
        outboxId: '4b7f494c-97e7-4d85-8a20-4638ed76e7ac',
        queued: true
      }))
    } as unknown as OutboxService;
    const service = new WhatsAppService(
      chatbotService,
      messageService,
      undefined,
      aiRuntime,
      outbox,
      '00000000-0000-4000-8000-000000000001'
    );

    await (service as unknown as SessionHarness).processIncomingMessage({
      key: {
        id: 'incoming-fallback-message',
        remoteJid: '6281234567890@s.whatsapp.net',
        fromMe: false
      },
      message: { conversation: 'Pertanyaan baru' }
    } as WAMessage);

    expect(chatbotService.evaluate).toHaveBeenCalledWith('Pertanyaan baru');
    expect(outbox.queueAutomatedResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        responseProviderMessageId: 'incoming-fallback-message:legacy',
        source: 'legacy_fallback'
      })
    );
  });

  it('fences sends before waiting for an active socket to close during credential reset', async () => {
    const { service, harness } = createService();
    let finishClose!: () => void;
    const pendingClose = new Promise<void>((resolve) => {
      finishClose = resolve;
    });
    const close = vi.fn(() => pendingClose);
    harness.status = 'connected';
    harness.operationalState = 'connected';
    harness.connectedSince = '2026-07-30T03:00:00.000Z';
    harness.socket = {
      ev: { removeAllListeners: vi.fn() },
      ws: { close }
    };
    vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
    vi.spyOn(fs, 'lstat').mockResolvedValue({
      isSymbolicLink: () => false
    } as Awaited<ReturnType<typeof fs.lstat>>);
    vi.spyOn(fs, 'readdir').mockResolvedValue([]);
    const startSocket = vi
      .spyOn(harness, 'startSocket')
      .mockResolvedValue(undefined);

    const reset = service.resetCredentials();

    expect(service.getOperationalStatus()).toMatchObject({
      state: 'connecting',
      connectedSince: null
    });
    await expect(
      service.sendText('6281234567890@s.whatsapp.net', 'test')
    ).rejects.toThrow('WhatsApp is not connected');
    expect(startSocket).not.toHaveBeenCalled();

    finishClose();
    await reset;

    expect(close).toHaveBeenCalledOnce();
    expect(startSocket).toHaveBeenCalledOnce();
  });

  it('removes WhatsApp credentials without deleting persisted anti-ban state', async () => {
    const { service, harness } = createService();
    harness.status = 'connected';
    harness.operationalState = 'connected';
    harness.connectedSince = '2026-07-30T03:00:00.000Z';
    vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
    vi.spyOn(fs, 'lstat').mockResolvedValue({
      isSymbolicLink: () => false
    } as Awaited<ReturnType<typeof fs.lstat>>);
    vi.spyOn(fs, 'readdir').mockResolvedValue([
      'creds.json',
      'session-1.json',
      'antiban-state.json'
    ] as never);
    const remove = vi.spyOn(fs, 'rm').mockResolvedValue(undefined);
    vi.spyOn(harness, 'startSocket').mockResolvedValue(undefined);

    await service.resetCredentials();

    const removedEntries = remove.mock.calls.map(([target]) =>
      path.basename(String(target))
    );
    expect(removedEntries).toEqual(['creds.json', 'session-1.json']);
    expect(removedEntries).not.toContain('antiban-state.json');
  });

  it('starts a fresh pairing socket after a QR expires', async () => {
    vi.useFakeTimers();
    const { service, harness } = createService();
    const close = vi.fn(async () => undefined);
    harness.socket = {
      ev: { removeAllListeners: vi.fn() },
      ws: { close }
    };
    const startSocket = vi
      .spyOn(harness, 'startSocket')
      .mockResolvedValue(undefined);

    await harness.handleConnectionUpdate({ qr: 'temporary-qr' });
    await vi.advanceTimersByTimeAsync(PAIRING_QR_TTL_MS);

    expect(close).toHaveBeenCalledOnce();
    expect(startSocket).toHaveBeenCalledOnce();
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

  it('enters degraded reconnecting state when initial setup fails', async () => {
    vi.useFakeTimers();
    const { service, harness, operationalEvents } = createService();
    const failure = new Error('provider unavailable');
    vi.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
    vi.spyOn(fs, 'stat').mockRejectedValue(new Error('no credentials'));
    const startSocket = vi
      .spyOn(harness, 'startSocket')
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined);

    await expect(service.connect()).rejects.toThrow('provider unavailable');

    expect(service.getOperationalStatus()).toMatchObject({
      state: 'reconnecting',
      lastDisconnect: {
        reason: 'provider unavailable',
        classification: 'unknown'
      },
      reconnect: {
        attempt: 1,
        eligible: true
      }
    });
    expect(operationalEvents.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'session.initialization_failed',
        severity: 'critical'
      })
    );
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(startSocket).toHaveBeenCalledTimes(2);

    await service.disconnect();
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
