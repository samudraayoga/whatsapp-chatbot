import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { pool } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import type { QueryExecutor } from './message.service.js';

export type OperationalEvent = {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  occurredAt: string;
  data: Record<string, unknown>;
};

export class OperationalEventService {
  private readonly emitter = new EventEmitter();

  constructor(private readonly database: QueryExecutor = pool) {
    this.emitter.setMaxListeners(100);
  }

  publish(input: {
    type: string;
    severity?: OperationalEvent['severity'];
    data?: Record<string, unknown>;
  }): OperationalEvent {
    const event: OperationalEvent = {
      id: randomUUID(),
      type: input.type,
      severity: input.severity ?? 'info',
      occurredAt: new Date().toISOString(),
      data: input.data ?? {}
    };

    this.emitter.emit('event', event);
    void this.persist(event);
    return event;
  }

  subscribe(listener: (event: OperationalEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  async listRecent(limit = 10): Promise<OperationalEvent[]> {
    const result = await this.database.query<{
      id: string;
      event_type: string;
      severity: OperationalEvent['severity'];
      payload: Record<string, unknown> | null;
      occurred_at: Date;
    }>(
      `
        SELECT id, event_type, severity, payload, occurred_at
        FROM operational_events
        ORDER BY occurred_at DESC
        LIMIT $1;
      `,
      [Math.max(1, Math.min(limit, 50))]
    );

    return result.rows.map((row) => ({
      id: row.id,
      type: row.event_type,
      severity: row.severity,
      occurredAt: new Date(row.occurred_at).toISOString(),
      data: row.payload ?? {}
    }));
  }

  private async persist(event: OperationalEvent): Promise<void> {
    try {
      await this.database.query(
        `
          INSERT INTO operational_events (
            id,
            event_type,
            severity,
            payload,
            occurred_at
          )
          VALUES ($1, $2, $3, $4, $5);
        `,
        [
          event.id,
          event.type,
          event.severity,
          JSON.stringify(event.data),
          event.occurredAt
        ]
      );
    } catch (error) {
      logger.error('Failed to persist operational event', {
        eventType: event.type,
        error: error instanceof Error ? error.message : 'Unknown database error'
      });
    }
  }
}
