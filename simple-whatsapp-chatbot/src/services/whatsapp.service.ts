import { Boom } from '@hapi/boom';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
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
import { sanitizeOperationalError } from '../utils/sanitize.js';

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

export type WhatsAppDisconnectClassification =
  | 'recoverable'
  | 'logged_out'
  | 'bad_session'
  | 'fatal'
  | 'unknown';

export type WhatsAppOperationalStatus = {
  state: WhatsAppOperationalState;
  connectedSince: string | null;
  lastDisconnect: {
    code?: number;
    reason: string;
    classification: WhatsAppDisconnectClassification;
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

export type SendingBlock = {
  code:
    | 'MANUAL_PAUSE'
    | 'HEALTH_AUTO_PAUSE'
    | 'RECOVERY_PAUSED'
    | 'RECOVERY_DEAD'
    | 'WARMUP_LIMIT';
  retryAfterMs: number;
};

const baileysLogger = P({ level: 'silent' });
type ProtectedWASocket = ReturnType<typeof makeWASocket> & { antiban: AntiBan };
export const PAIRING_QR_TTL_MS = 10_000;

export class ReconnectNotAllowedError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'ReconnectNotAllowedError';
  }
}

const fatalDisconnectCodes = new Set<number>([
  DisconnectReason.loggedOut,
  DisconnectReason.badSession,
  DisconnectReason.forbidden,
  DisconnectReason.multideviceMismatch,
  DisconnectReason.connectionReplaced,
  405
]);

export const isTerminalDisconnect = (statusCode: number | undefined): boolean =>
  statusCode !== undefined && fatalDisconnectCodes.has(statusCode);

export const shouldReconnect = (
  statusCode: number | undefined,
  isShuttingDown: boolean
): boolean => !isShuttingDown && !isTerminalDisconnect(statusCode);

export const getReconnectDelayMs = (
  statusCode: number | undefined
): number => {
  if (statusCode === DisconnectReason.unavailableService) return 60_000;
  if (statusCode === 429) return 300_000;
  if (statusCode === DisconnectReason.restartRequired) return 2_000;
  if (
    statusCode === DisconnectReason.timedOut ||
    statusCode === DisconnectReason.connectionClosed
  ) {
    return 5_000;
  }
  return 15_000;
};

export const resolveReconnectEligibility = (input: {
  state: WhatsAppOperationalState;
  isShuttingDown: boolean;
  hasScheduledReconnect: boolean;
  reconnectInFlight: boolean;
  lastDisconnectClassification?: WhatsAppDisconnectClassification;
}): { eligible: boolean; disabledReason: string | null } => {
  if (input.isShuttingDown) {
    return { eligible: false, disabledReason: 'service_shutting_down' };
  }

  if (
    input.state === 'disconnected' &&
    input.lastDisconnectClassification === 'fatal'
  ) {
    return { eligible: false, disabledReason: 'terminal_disconnect' };
  }

  if (
    input.state === 'disconnected' ||
    (input.state === 'reconnecting' &&
      input.hasScheduledReconnect &&
      !input.reconnectInFlight)
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
    disabledReason: reasons[input.state] ?? 'reconnect_not_available'
  };
};

export class WhatsAppService {
  private socket: ProtectedWASocket | null = null;
  private status: WhatsAppStatus = 'disconnected';
  private operationalState: WhatsAppOperationalState = 'starting';
  private connectedSince: string | null = null;
  private lastDisconnect: {
    code?: number;
    reason: string;
    classification: WhatsAppDisconnectClassification;
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
    timelock: {
      isActive: boolean;
      enforcementType?: string;
      expiresAt?: Date;
      detectedAt?: Date;
      errorCount: number;
    };
  } | null {
    if (!this.socket) {
      return null;
    }

    return {
      stats: this.socket.antiban.getStats(),
      config: this.socket.antiban.getConfig(),
      timelock: this.socket.antiban.timelock.getState()
    };
  }

  getSendingBlocks(): SendingBlock[] {
    const blocks: SendingBlock[] = [];
    if (this.manualPaused) {
      blocks.push({ code: 'MANUAL_PAUSE', retryAfterMs: 30_000 });
    }
    const protection = this.getProtectionSnapshot();
    if (!protection) return blocks;
    const riskOrder = ['low', 'medium', 'high', 'critical'];
    if (protection.stats.banRecovery?.phase === 'dead') {
      blocks.push({ code: 'RECOVERY_DEAD', retryAfterMs: 60 * 60 * 1000 });
    }
    if (protection.stats.banRecovery?.phase === 'paused') {
      blocks.push({
        code: 'RECOVERY_PAUSED',
        retryAfterMs: Math.max(
          30_000,
          protection.stats.banRecovery.pauseRemainingMs ?? 60_000
        )
      });
    }
    if (
      riskOrder.indexOf(protection.stats.health.risk) >=
      riskOrder.indexOf(protection.config.autoPauseAt)
    ) {
      blocks.push({ code: 'HEALTH_AUTO_PAUSE', retryAfterMs: 60_000 });
    }
    if (
      protection.stats.warmUp.todaySent >=
      protection.stats.warmUp.todayLimit
    ) {
      blocks.push({ code: 'WARMUP_LIMIT', retryAfterMs: 60 * 60 * 1000 });
    }
    return blocks;
  }

  getSendingBlock(): SendingBlock | null {
    return this.getSendingBlocks()[0] ?? null;
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
    const { version, isLatest } = await fetchLatestBaileysVersion();

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
      markOnlineOnConnect: false,
      version
    });

    logger.info('WhatsApp protocol version resolved', {
      version: version.join('.'),
      isLatest
    });

    const socket = wrapSocket(
      // The middleware's transport type accepts generic string group actions,
      // while Baileys exposes a narrower ParticipantAction union at compile time.
      rawSocket as any,
      {
        preset: 'conservative',
        persist: path.resolve(env.WA_AUTH_PATH, 'antiban-state.json'),
        logging: false
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
      void saveCreds()
        .then(() => {
          this.credentialUpdatedAt = new Date().toISOString();
        })
        .catch((error) => {
          logger.error('Failed to persist WhatsApp credentials', {
            error: sanitizeOperationalError(error)
          });
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
      const disconnectMessage = sanitizeOperationalError(
        update.lastDisconnect?.error,
        'Unknown disconnect error'
      );
      const classification =
        statusCode === DisconnectReason.loggedOut
          ? ('logged_out' as const)
          : statusCode === DisconnectReason.badSession
            ? ('bad_session' as const)
            : isTerminalDisconnect(statusCode)
              ? ('fatal' as const)
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
          statusCode === DisconnectReason.loggedOut
            ? 'logged_out'
            : statusCode === DisconnectReason.badSession
              ? 'bad_session'
              : 'disconnected';
        this.nextRetryAt = null;
        this.clearPairingQr();
        this.publishOperationalEvent(
          this.operationalState === 'disconnected'
            ? 'session.fatal_disconnect'
            : `session.${this.operationalState}`,
          'critical',
          {
            statusCode: statusCode ?? null,
            classification
          }
        );
        logger.warn('WhatsApp automatic reconnect stopped after a terminal disconnect');
        return;
      }

      if (shouldReconnect(statusCode, this.isShuttingDown)) {
        this.publishOperationalEvent('session.disconnected', 'warning', {
          statusCode: statusCode ?? null,
          classification
        });
        this.scheduleReconnect(statusCode);
      } else {
        this.operationalState = 'disconnected';
      }
    }
  }

  private scheduleReconnect(statusCode?: number): void {
    if (this.reconnectTimer) {
      return;
    }

    const reconnectDelayMs = getReconnectDelayMs(statusCode);
    this.operationalState = 'reconnecting';
    this.reconnectAttempt += 1;
    this.nextRetryAt = new Date(Date.now() + reconnectDelayMs).toISOString();
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
        const message = sanitizeOperationalError(error, 'Unknown reconnect error');
        logger.error('Failed to reconnect WhatsApp', { error: message });
        this.operationalState = 'disconnected';
        this.scheduleReconnect();
      });
    }, reconnectDelayMs);
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

  resumeSending(): void {
    this.manualPaused = false;
    this.socket?.antiban.resume();
    this.publishOperationalEvent('safety.resume_requested', 'info', {
      source: 'admin'
    });
  }

  restoreManualPause(paused: boolean): void {
    this.manualPaused = paused;
  }

  resetSafetyState(): void {
    this.socket?.antiban.reset();
    if (this.manualPaused) this.socket?.antiban.pause();
    this.publishOperationalEvent('safety.state_reset', 'warning', {
      source: 'admin'
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
        const content = sanitizeOperationalError(
          error,
          'Unknown message processing error'
        );
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

    const evaluation = await this.chatbotService.evaluate(text);
    const savedIncoming = await this.messageService.saveMessage({
      whatsappMessageId,
      whatsappJid: remoteJid,
      direction: 'incoming',
      content: text,
      displayName: message.pushName ?? null,
      createHandoff: evaluation.matchedRule.action === 'create_handoff',
      metadata: {
        chatbotVersionId: evaluation.versionId,
        chatbotRuleId: evaluation.matchedRule.id
      }
    });

    if (!savedIncoming.inserted) {
      logger.warn('Duplicate incoming WhatsApp message ignored');
      return;
    }

    logger.info('Incoming WhatsApp message received', {
      phone: maskPhoneNumber(remoteJid.replace(/@.+$/, ''))
    });

    const response = await this.sendText(remoteJid, evaluation.response);

    await this.messageService.saveMessage({
      whatsappMessageId: response?.key.id ?? null,
      whatsappJid: remoteJid,
      direction: 'outgoing',
      content: evaluation.response,
      status: 'sent',
      metadata: {
        chatbotVersionId: evaluation.versionId,
        chatbotRuleId: evaluation.matchedRule.id
      }
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
        const message = sanitizeOperationalError(error, 'Unknown close error');
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
    return resolveReconnectEligibility({
      state,
      isShuttingDown: this.isShuttingDown,
      hasScheduledReconnect: Boolean(this.reconnectTimer),
      reconnectInFlight: this.reconnectInFlight,
      lastDisconnectClassification: this.lastDisconnect?.classification
    });
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
    void this.operationalEvents?.publish({ type, severity, data });
  }
}
