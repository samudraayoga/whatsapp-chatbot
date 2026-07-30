import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { sanitizeOperationalError } from '../utils/sanitize.js';
import {
  OutboxService,
  type ClaimedOutboxItem
} from './outbox.service.js';
import {
  classifySafetySendError,
  safetyReasonCopy,
  type SafetyReasonCode
} from './safety-policy.js';

type OutboxSender = {
  getStatus(): 'connecting' | 'connected' | 'disconnected';
  isSendingPaused(): boolean;
  getSendingBlock?(): {
    code: SafetyReasonCode;
    retryAfterMs: number;
  } | null;
  sendText(
    jid: string,
    text: string
  ): Promise<{ key: { id?: string | null } } | undefined>;
};

type OutboxWorkerOptions = {
  pollIntervalMs?: number;
  leaseMs?: number;
  retryBaseMs?: number;
};

export class OutboxWorker {
  private readonly workerId = `outbox-${randomUUID()}`;
  private readonly pollIntervalMs: number;
  private readonly leaseMs: number;
  private readonly retryBaseMs: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly outbox: OutboxService,
    private readonly sender: OutboxSender,
    options: OutboxWorkerOptions = {}
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.leaseMs = options.leaseMs ?? 60_000;
    this.retryBaseMs = options.retryBaseMs ?? 5_000;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
    this.timer.unref();
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const block =
        this.sender.getSendingBlock?.() ??
        (this.sender.isSendingPaused()
          ? { code: 'MANUAL_PAUSE' as const, retryAfterMs: 30_000 }
          : null);
      if (block) {
        const copy = safetyReasonCopy(block.code);
        await this.outbox.deferNextForSafety(
          block.code,
          block.retryAfterMs,
          copy
        );
        return;
      }
      const item = await this.outbox.claimNext(this.workerId, this.leaseMs);
      if (!item) return;
      await this.process(item);
    } catch (error) {
      logger.error('Outbox worker tick failed', {
        error: sanitizeOperationalError(error, 'Unknown worker error')
      });
    } finally {
      this.running = false;
    }
  }

  private async process(item: ClaimedOutboxItem): Promise<void> {
    if (this.sender.isSendingPaused()) {
      const copy = safetyReasonCopy('MANUAL_PAUSE');
      await this.outbox.defer(
        item,
        copy.code,
        30_000,
        true,
        copy
      );
      return;
    }
    if (this.sender.getStatus() !== 'connected') {
      const delay = this.retryBaseMs * 2 ** Math.max(0, item.attempt - 1);
      await this.outbox.defer(item, 'WHATSAPP_NOT_READY', delay);
      return;
    }

    try {
      const sent = await this.sender.sendText(item.jid, item.text);
      await this.outbox.complete(item, sent?.key.id ?? null);
    } catch (error) {
      const safety = classifySafetySendError(error);
      if (safety) {
        await this.outbox.defer(
          item,
          safety.code,
          Math.max(this.retryBaseMs, 30_000),
          true,
          safety
        );
        return;
      }
      // Once the provider call begins, a rejection may still mean the provider
      // accepted the message. Never blind-retry an ambiguous outcome.
      await this.outbox.markUnknown(item, error);
    }
  }
}
