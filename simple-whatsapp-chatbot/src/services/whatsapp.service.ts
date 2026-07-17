import { Boom } from '@hapi/boom';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState,
  type ConnectionState,
  type WAMessage
} from '@whiskeysockets/baileys';
import fs from 'node:fs/promises';
import path from 'node:path';
import P from 'pino';
import qrcode from 'qrcode-terminal';
import { ChatbotService } from './chatbot.service.js';
import { MessageService } from './message.service.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { maskPhoneNumber } from '../utils/phone.js';

type WhatsAppStatus = 'connecting' | 'connected' | 'disconnected';

const baileysLogger = P({ level: 'silent' });

export class WhatsAppService {
  private socket: ReturnType<typeof makeWASocket> | null = null;
  private status: WhatsAppStatus = 'disconnected';
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(
    private readonly chatbotService: ChatbotService,
    private readonly messageService: MessageService
  ) {}

  getStatus(): WhatsAppStatus {
    return this.status;
  }

  async connect(): Promise<void> {
    await fs.mkdir(path.resolve(env.WA_AUTH_PATH), { recursive: true });
    await this.startSocket();
  }

  private async startSocket(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(path.resolve(env.WA_AUTH_PATH));

    this.cleanupSocketListeners();
    this.status = 'connecting';
    logger.info('WhatsApp connecting');

    const socket = makeWASocket({
      auth: state,
      browser: Browsers.ubuntu('Simple WhatsApp Chatbot'),
      logger: baileysLogger,
      markOnlineOnConnect: false
    });

    this.socket = socket;

    socket.ev.on('creds.update', saveCreds);
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

      try {
        qrcode.generate(update.qr, { small: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown QR error';
        logger.error('Failed to render WhatsApp QR code', { error: message });
      }
    }

    if (update.connection === 'connecting') {
      this.status = 'connecting';
      logger.info('WhatsApp connecting');
      return;
    }

    if (update.connection === 'open') {
      this.status = 'connected';
      this.clearReconnectTimer();
      logger.info('WhatsApp connected');
      return;
    }

    if (update.connection === 'close') {
      this.status = 'disconnected';

      const statusCode =
        update.lastDisconnect?.error instanceof Boom
          ? update.lastDisconnect.error.output.statusCode
          : undefined;

      logger.warn('WhatsApp disconnected', {
        statusCode: statusCode ?? 'unknown',
        error:
          update.lastDisconnect?.error instanceof Error
            ? update.lastDisconnect.error.message
            : 'Unknown disconnect error'
      });

      if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
        logger.warn('WhatsApp session is logged out or invalid. Scan QR again after clearing auth session.');
        return;
      }

      if (!this.isShuttingDown) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.startSocket().catch((error) => {
        const message = error instanceof Error ? error.message : 'Unknown reconnect error';
        logger.error('Failed to reconnect WhatsApp', { error: message });
        this.scheduleReconnect();
      });
    }, 5_000);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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
    this.clearReconnectTimer();
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
  }
}
