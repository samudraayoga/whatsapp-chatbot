import { Boom } from '@hapi/boom';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState,
  type ConnectionState,
  type WAMessage
} from '@whiskeysockets/baileys';
import {
  wrapSocket,
  type AntiBan,
  type AntiBanStats,
  type ResolvedConfig
} from 'baileys-antiban';
import fs from 'node:fs/promises';
import path from 'node:path';
import P from 'pino';
import { ChatbotService } from './chatbot.service.js';
import { MessageService } from './message.service.js';
import { OperationalEventService } from './operational-event.service.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { maskPhoneNumber } from '../utils/phone.js';

type WhatsAppStatus = 'connecting' | 'connected' | 'disconnected';
export type WhatsAppOperationalState =
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

export type WhatsAppOperationalStatus = {
  state: WhatsAppOperationalState;
  connectedSince: string | null;
  lastDisconnect: {
    code?: number;
    reason: string;
    classification: 'recoverable' | 'logged_out' | 'bad_session' | 'unknown';
    occurredAt: string;
  } | null;
  reconnect: {
    attempt: number;
    nextRetryAt: string | null;
    eligible: boolean;
    disabledReason: string | null;
  };
  browser: {
    platform: string;
    name: string;
  };
  credentialUpdatedAt: string | null;
};

const baileysLogger = P({ level: 'silent' });
type ProtectedWASocket = ReturnType<typeof makeWASocket> & { antiban: AntiBan };
const RECONNECT_DELAY_MS = 5_000;
export const PAIRING_QR_TTL_MS = 60_000;

export class ReconnectNotAllowedError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'ReconnectNotAllowedError';
  }
}

export const isTerminalDisconnect = (statusCode: number | undefined): boolean =>
  statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession;

export const shouldReconnect = (
  statusCode: number | undefined,
  isShuttingDown: boolean
): boolean => !isShuttingDown && !isTerminalDisconnect(statusCode);

export class WhatsAppService {
  private socket: ProtectedWASocket | null = null;
  private status: WhatsAppStatus = 'disconnected';
  private operationalState: WhatsAppOperationalState = 'starting';
  private connectedSince: string | null = null;
  private lastDisconnect: {
    code?: number;
    reason: string;
    classification: 'recoverable' | 'logged_out' | 'bad_session' | 'unknown';
    occurredAt: string;
  } | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private nextRetryAt: string | null = null;
  private pairingQr: { value: string; expiresAt: string } | null = null;
  private pairingQrTimer: NodeJS.Timeout | null = null;
  private credentialUpdatedAt: string | null = null;
  private manualPaused = false;
  private reconnectInFlight = false;
  private isShuttingDown = false;

  constructor(
    private readonly chatbotService: ChatbotService,
    private readonly messageService: MessageService,
    private readonly operationalEvents?: OperationalEventService
  ) {}

  getStatus(): WhatsAppStatus {
    return this.status;
  }

  getOperationalStatus(): WhatsAppOperationalStatus {
    const state =
      this.manualPaused && this.operationalState === 'connected'
        ? 'paused'
        : this.operationalState;
    const reconnectEligibility = this.getReconnectEligibility(state);

    return {
      state,
      connectedSince: this.connectedSince,
      lastDisconnect: this.lastDisconnect,
      reconnect: {
        attempt: this.reconnectAttempt,
        nextRetryAt: this.nextRetryAt,
        ...reconnectEligibility
      },
      browser: {
        platform: 'Ubuntu',
        name: 'Simple WhatsApp Chatbot'
      },
      credentialUpdatedAt: this.credentialUpdatedAt
    };
  }

  getPairingQr(): { qr: string; expiresAt: string } | null {
    if (
      !this.pairingQr ||
      this.operationalState !== 'qr_required' ||
      new Date(this.pairingQr.expiresAt).getTime() <= Date.now()
    ) {
      this.clearPairingQr();
      return null;
    }

    return {
      qr: this.pairingQr.value,
      expiresAt: this.pairingQr.expiresAt
    };
  }

  isSendingPaused(): boolean {
    return this.manualPaused;
  }

  getProtectionSnapshot(): {
    stats: AntiBanStats;
    config: ResolvedConfig;
  } | null {
    if (!this.socket) {
      return null;
    }

    return {
      stats: this.socket.antiban.getStats(),
      config: this.socket.antiban.getConfig()
    };
  }

  async connect(): Promise<void> {
    this.isShuttingDown = false;
    this.operationalState = 'starting';
    await fs.mkdir(path.resolve(env.WA_AUTH_PATH), { recursive: true });
    await this.readCredentialTimestamp();
    await this.startSocket();
  }

  private async startSocket(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(path.resolve(env.WA_AUTH_PATH));

    this.cleanupSocketListeners();
    this.status = 'connecting';
    if (this.operationalState !== 'reconnecting') {
      this.operationalState = 'connecting';
    }
    logger.info('WhatsApp connecting');
    this.publishOperationalEvent('session.connecting');

    const rawSocket = makeWASocket({
      auth: state,
      browser: Browsers.ubuntu('Simple WhatsApp Chatbot'),
      logger: baileysLogger,
      markOnlineOnConnect: false
    });

    const socket = wrapSocket(
      // The middleware's transport type accepts generic string group actions,
      // while Baileys exposes a narrower ParticipantAction union at compile time.
      rawSocket as any,
      {
        preset: 'conservative',
        persist: path.resolve(env.WA_AUTH_PATH, 'antiban-state.json'),
        logging: true
      },
      undefined,
      {
        autoRespondToIncoming: false,
        // Balasan chatbot harus tetap persis seperti yang ditentukan aplikasi.
        legitimacySignals: false
      }
    ) as unknown as ProtectedWASocket;

    this.socket = socket;

    if (this.manualPaused) {
      socket.antiban.pause();
    }

    socket.ev.on('creds.update', () => {
      void saveCreds().then(() => {
        this.credentialUpdatedAt = new Date().toISOString();
      });
    });
    socket.ev.on('connection.update', (update) => {
      void this.handleConnectionUpdate(update);
    });
    socket.ev.on('messages.upsert', (event) => {
      void this.handleMessagesUpsert(event.type, event.messages);
    });
  }

  private cleanupSocketListeners(): void {
    if (!this.socket) {
      return;
    }

    this.socket.ev.removeAllListeners('creds.update');
    this.socket.ev.removeAllListeners('connection.update');
    this.socket.ev.removeAllListeners('messages.upsert');
  }

  private async handleConnectionUpdate(update: Partial<ConnectionState>): Promise<void> {
    if (update.qr) {
      logger.info('WhatsApp QR code available');
      this.setPairingQr(update.qr);
    }

    if (update.connection === 'connecting') {
      this.status = 'connecting';
      if (this.operationalState !== 'qr_required' && this.reconnectAttempt === 0) {
        this.operationalState = 'connecting';
      }
      logger.info('WhatsApp connecting');
      return;
    }

    if (update.connection === 'open') {
      this.status = 'connected';
      this.operationalState = 'connected';
      this.connectedSince = new Date().toISOString();
      this.reconnectAttempt = 0;
      this.nextRetryAt = null;
      this.reconnectInFlight = false;
      this.clearReconnectTimer();
      this.clearPairingQr();
      logger.info('WhatsApp connected');
      this.publishOperationalEvent('session.connected');
      return;
    }

    if (update.connection === 'close') {
      this.status = 'disconnected';
      this.connectedSince = null;
      this.reconnectInFlight = false;

      const statusCode =
        update.lastDisconnect?.error instanceof Boom
          ? update.lastDisconnect.error.output.statusCode
          : undefined;
      const disconnectMessage =
        update.lastDisconnect?.error instanceof Error
          ? update.lastDisconnect.error.message
          : 'Unknown disconnect error';
      const classification =
        statusCode === DisconnectReason.loggedOut
          ? ('logged_out' as const)
          : statusCode === DisconnectReason.badSession
            ? ('bad_session' as const)
            : statusCode === undefined
              ? ('unknown' as const)
              : ('recoverable' as const);
      this.lastDisconnect = {
        ...(statusCode === undefined ? {} : { code: statusCode }),
        reason: disconnectMessage,
        classification,
        occurredAt: new Date().toISOString()
      };

      logger.warn('WhatsApp disconnected', {
        statusCode: statusCode ?? 'unknown',
        error: disconnectMessage
      });

      if (isTerminalDisconnect(statusCode)) {
        this.clearReconnectTimer();
        this.operationalState =
          statusCode === DisconnectReason.loggedOut ? 'logged_out' : 'bad_session';
        this.nextRetryAt = null;
        this.clearPairingQr();
        this.publishOperationalEvent(`session.${this.operationalState}`, 'critical', {
          statusCode: statusCode ?? null,
          classification
        });
        logger.warn('WhatsApp session is logged out or invalid. Scan QR again after clearing auth session.');
        return;
      }

      if (shouldReconnect(statusCode, this.isShuttingDown)) {
        this.publishOperationalEvent('session.disconnected', 'warning', {
          statusCode: statusCode ?? null,
          classification
        });
        this.scheduleReconnect();
      } else {
        this.operationalState = 'disconnected';
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.operationalState = 'reconnecting';
    this.reconnectAttempt += 1;
    this.nextRetryAt = new Date(Date.now() + RECONNECT_DELAY_MS).toISOString();
    this.publishOperationalEvent('session.reconnect_scheduled', 'warning', {
      attempt: this.reconnectAttempt,
      nextRetryAt: this.nextRetryAt
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.nextRetryAt = null;
      this.reconnectInFlight = true;
      void this.startSocket().catch((error) => {
        this.reconnectInFlight = false;
        const message = error instanceof Error ? error.message : 'Unknown reconnect error';
        logger.error('Failed to reconnect WhatsApp', { error: message });
        this.operationalState = 'disconnected';
        this.scheduleReconnect();
      });
    }, RECONNECT_DELAY_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.nextRetryAt = null;
  }

  async requestReconnect(): Promise<WhatsAppOperationalStatus> {
    const eligibility = this.getReconnectEligibility(
      this.getOperationalStatus().state
    );

    if (!eligibility.eligible || this.reconnectInFlight) {
      throw new ReconnectNotAllowedError(
        eligibility.disabledReason ?? 'reconnect_already_in_progress'
      );
    }

    this.reconnectInFlight = true;
    this.clearReconnectTimer();
    this.operationalState = 'reconnecting';
    this.reconnectAttempt += 1;
    this.publishOperationalEvent('session.reconnect_requested', 'warning', {
      attempt: this.reconnectAttempt
    });

    this.cleanupSocketListeners();
    if (this.socket) {
      await this.socket.ws.close().catch(() => undefined);
      this.socket = null;
    }

    try {
      await this.startSocket();
      return this.getOperationalStatus();
    } catch (error) {
      this.reconnectInFlight = false;
      this.operationalState = 'disconnected';
      this.scheduleReconnect();
      throw error;
    }
  }

  pauseSending(): void {
    if (this.manualPaused) {
      return;
    }

    this.manualPaused = true;
    this.socket?.antiban.pause();
    this.publishOperationalEvent('safety.paused', 'warning', {
      source: 'operator'
    });
  }

  private extractText(message: WAMessage): string {
    return (
      message.message?.conversation ??
      message.message?.extendedTextMessage?.text ??
      ''
    ).trim();
  }

  private async handleMessagesUpsert(type: string, messages: WAMessage[]): Promise<void> {
    if (type !== 'notify') {
      return;
    }

    for (const message of messages) {
      try {
        await this.processIncomingMessage(message);
      } catch (error) {
        const content = error instanceof Error ? error.message : 'Unknown message processing error';
        logger.error('Failed to process incoming WhatsApp message', { error: content });
      }
    }
  }

  private async processIncomingMessage(message: WAMessage): Promise<void> {
    const remoteJid = message.key.remoteJid;
    const whatsappMessageId = message.key.id;

    if (!remoteJid || !whatsappMessageId) {
      return;
    }

    if (message.key.fromMe) {
      return;
    }

    if (remoteJid === 'status@broadcast' || remoteJid.endsWith('@g.us')) {
      return;
    }

    const text = this.extractText(message);

    if (!text) {
      return;
    }

    const savedIncoming = await this.messageService.saveMessage({
      whatsappMessageId,
      whatsappJid: remoteJid,
      direction: 'incoming',
      content: text,
      displayName: message.pushName ?? null
    });

    if (!savedIncoming.inserted) {
      logger.warn('Duplicate incoming WhatsApp message ignored', { whatsappMessageId });
      return;
    }

    logger.info('Incoming WhatsApp message received', {
      phone: maskPhoneNumber(remoteJid.replace(/@.+$/, ''))
    });

    const reply = this.chatbotService.getReply(text);
    const response = await this.sendText(remoteJid, reply);

    await this.messageService.saveMessage({
      whatsappMessageId: response?.key.id ?? null,
      whatsappJid: remoteJid,
      direction: 'outgoing',
      content: reply,
      status: 'sent'
    });
  }

  async sendText(jid: string, text: string): Promise<WAMessage | undefined> {
    if (this.manualPaused) {
      throw new Error('WhatsApp sending is paused');
    }

    if (!this.socket || this.status !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }

    const response = await this.socket.sendMessage(jid, { text });

    logger.info('Outgoing WhatsApp message sent', {
      phone: maskPhoneNumber(jid.replace(/@.+$/, ''))
    });

    return response;
  }

  async disconnect(): Promise<void> {
    this.isShuttingDown = true;
    this.operationalState = 'shutting_down';
    this.publishOperationalEvent('session.shutting_down');
    this.clearReconnectTimer();
    this.clearPairingQr();
    this.cleanupSocketListeners();

    if (this.socket) {
      try {
        await this.socket.ws.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown close error';
        logger.error('Failed to close WhatsApp socket cleanly', { error: message });
      }
    }

    this.socket = null;
    this.status = 'disconnected';
    this.operationalState = 'disconnected';
    this.connectedSince = null;
  }

  private getReconnectEligibility(
    state: WhatsAppOperationalState
  ): { eligible: boolean; disabledReason: string | null } {
    if (this.isShuttingDown) {
      return { eligible: false, disabledReason: 'service_shutting_down' };
    }

    if (
      state === 'disconnected' ||
      (state === 'reconnecting' &&
        Boolean(this.reconnectTimer) &&
        !this.reconnectInFlight)
    ) {
      return { eligible: true, disabledReason: null };
    }

    const reasons: Partial<Record<WhatsAppOperationalState, string>> = {
      starting: 'session_starting',
      connecting: 'connection_in_progress',
      qr_required: 'pairing_required',
      connected: 'already_connected',
      reconnecting: 'reconnect_in_progress',
      paused: 'sending_paused',
      logged_out: 'auth_reset_required',
      bad_session: 'auth_reset_required',
      shutting_down: 'service_shutting_down'
    };

    return {
      eligible: false,
      disabledReason: reasons[state] ?? 'reconnect_not_available'
    };
  }

  private setPairingQr(value: string): void {
    this.clearPairingQr();
    const expiresAt = new Date(Date.now() + PAIRING_QR_TTL_MS).toISOString();
    this.pairingQr = { value, expiresAt };
    this.operationalState = 'qr_required';
    this.publishOperationalEvent('session.qr_available', 'warning', {
      expiresAt
    });
    this.pairingQrTimer = setTimeout(() => {
      if (this.pairingQr?.expiresAt === expiresAt) {
        this.pairingQr = null;
        this.pairingQrTimer = null;
        this.publishOperationalEvent('session.qr_expired', 'warning');
      }
    }, PAIRING_QR_TTL_MS);
  }

  private clearPairingQr(): void {
    this.pairingQr = null;
    if (this.pairingQrTimer) {
      clearTimeout(this.pairingQrTimer);
      this.pairingQrTimer = null;
    }
  }

  private async readCredentialTimestamp(): Promise<void> {
    try {
      const stat = await fs.stat(path.resolve(env.WA_AUTH_PATH, 'creds.json'));
      this.credentialUpdatedAt = stat.mtime.toISOString();
    } catch {
      this.credentialUpdatedAt = null;
    }
  }

  private publishOperationalEvent(
    type: string,
    severity: 'info' | 'warning' | 'critical' = 'info',
    data: Record<string, unknown> = {}
  ): void {
    this.operationalEvents?.publish({ type, severity, data });
  }
}
