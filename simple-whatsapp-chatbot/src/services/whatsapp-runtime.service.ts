import { logger } from '../utils/logger.js';
import { sanitizeOperationalError } from '../utils/sanitize.js';

type WhatsAppLifecycle = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
};

/**
 * Owns the process-level WhatsApp lifecycle without making HTTP availability
 * depend on the provider connection. WhatsAppService owns reconnect policy;
 * this wrapper makes initialisation fire-and-forget and always observes its
 * promise so a provider failure cannot become an unhandled rejection.
 */
export class WhatsAppRuntime {
  private started = false;
  private stopping = false;

  constructor(private readonly service: WhatsAppLifecycle) {}

  start(): void {
    if (this.started || this.stopping) {
      return;
    }

    this.started = true;
    void Promise.resolve()
      .then(() => {
        if (this.stopping) return;
        return this.service.connect();
      })
      .then(() => {
        if (!this.stopping) {
          logger.info('WhatsApp runtime initialized');
        }
      })
      .catch((error) => {
        if (!this.stopping) {
          logger.error(
            'WhatsApp initialization failed; admin API remains available',
            {
              error: sanitizeOperationalError(
                error,
                'Unknown WhatsApp initialization error'
              )
            }
          );
        }
      });
  }

  async stop(): Promise<void> {
    if (this.stopping) {
      return;
    }

    this.stopping = true;
    await this.service.disconnect();
  }
}
