import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../database/connection.js';
import { maskPhoneNumber, normalizePhoneNumber, toWhatsAppJid, validatePhoneNumber } from '../utils/phone.js';
import { sanitizeOperationalError } from '../utils/sanitize.js';
import { decodeCursor, encodeCursor } from '../utils/cursor.js';
import { AppError } from '../middleware/error.middleware.js';
import { MessageService } from './message.service.js';

export type MessagePriority = 'high' | 'normal' | 'low';
export type OutboxState =
  | 'queued'
  | 'scheduled'
  | 'leased'
  | 'retrying'
  | 'safety_delayed'
  | 'failed'
  | 'completed'
  | 'canceled'
  | 'unknown_outcome';

type CreateMessageInput = {
  actorUserId: string;
  idempotencyKey: string;
  recipient: { contactId?: string; phone?: string };
  text: string;
  priority: MessagePriority;
  scheduledAt?: string | null;
};

type CommandResponse = {
  id: string;
  outboxId: string;
  state: 'accepted';
};

type QueueAutomatedResponseInput = {
  sourceProviderMessageId: string;
  responseProviderMessageId: string;
  text: string;
  source: 'ai' | 'legacy' | 'legacy_fallback';
  metadata?: Record<string, unknown>;
  priority?: MessagePriority;
};

export type ClaimedOutboxItem = {
  outboxId: string;
  messageId: string;
  logicalMessageId: string;
  jid: string;
  text: string;
  attempt: number;
  maxAttempts: number;
};

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const stablePayload = (input: CreateMessageInput) =>
  JSON.stringify({
    recipient: {
      contactId: input.recipient.contactId ?? null,
      phone: input.recipient.phone
        ? normalizePhoneNumber(input.recipient.phone)
        : null
    },
    message: { type: 'text', text: input.text },
    priority: input.priority,
    scheduledAt: input.scheduledAt ?? null
  });

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

export class OutboxService {
  async queueAutomatedResponse(input: QueueAutomatedResponseInput): Promise<{
    messageId: string;
    outboxId: string;
    queued: boolean;
  }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const message = await client.query<{ id: string; content: string }>(
        `
          INSERT INTO messages (
            whatsapp_message_id,
            contact_id,
            direction,
            message_type,
            content,
            status,
            priority,
            queued_at,
            metadata,
            updated_at
          )
          SELECT
            $2,
            source.contact_id,
            'outgoing',
            'text',
            $3,
            'accepted',
            $4,
            NOW(),
            $5::jsonb,
            NOW()
          FROM messages source
          WHERE source.whatsapp_message_id = $1
            AND source.direction = 'incoming'
          ON CONFLICT (whatsapp_message_id) DO UPDATE SET
            status = CASE
              WHEN messages.status = 'generated' THEN 'accepted'
              ELSE messages.status
            END,
            priority = EXCLUDED.priority,
            queued_at = COALESCE(messages.queued_at, NOW()),
            metadata = COALESCE(messages.metadata, '{}'::jsonb) || EXCLUDED.metadata,
            updated_at = NOW()
          RETURNING id::text, content;
        `,
        [
          input.sourceProviderMessageId,
          input.responseProviderMessageId,
          input.text,
          input.priority ?? 'normal',
          JSON.stringify({ source: input.source, ...(input.metadata ?? {}) })
        ]
      );
      const row = message.rows[0];
      if (!row) {
        throw new AppError(
          'Incoming message for automated response was not found',
          404,
          'AUTOMATED_RESPONSE_SOURCE_NOT_FOUND'
        );
      }
      if (row.content !== input.text) {
        throw new AppError(
          'Automated response ID was already used with different content',
          409,
          'AUTOMATED_RESPONSE_IDEMPOTENCY_CONFLICT'
        );
      }

      const outbox = await client.query<{ id: string }>(
        `
          INSERT INTO outbox_messages (id, message_id, state, next_attempt_at)
          VALUES ($1::uuid, $2::bigint, 'queued', NOW())
          ON CONFLICT (message_id) DO NOTHING
          RETURNING id::text;
        `,
        [randomUUID(), row.id]
      );
      const existing = outbox.rows[0]
        ? null
        : await client.query<{ id: string }>(
            'SELECT id::text FROM outbox_messages WHERE message_id = $1::bigint;',
            [row.id]
          );
      const outboxId = outbox.rows[0]?.id ?? existing?.rows[0]?.id;
      if (!outboxId) {
        throw new AppError(
          'Automated response could not be queued',
          500,
          'AUTOMATED_RESPONSE_QUEUE_FAILED'
        );
      }

      if (outbox.rows[0]) {
        await this.appendEvent(client, row.id, 'accepted', null, {
          source: input.source
        });
        await this.appendEvent(client, row.id, 'queued', null, {
          source: input.source
        });
      }
      await client.query('COMMIT');
      return { messageId: row.id, outboxId, queued: Boolean(outbox.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createMessage(input: CreateMessageInput): Promise<CommandResponse> {
    const client = await pool.connect();
    const scope = `admin.message.create:${input.actorUserId}`;
    const keyHash = sha256(input.idempotencyKey);
    const requestHash = sha256(stablePayload(input));

    try {
      await client.query('BEGIN');
      await client.query(
        `
          DELETE FROM idempotency_keys
          WHERE scope = $1
            AND key_hash = $2
            AND expires_at <= NOW();
        `,
        [scope, keyHash]
      );
      await client.query(
        `
          INSERT INTO idempotency_keys (
            scope,
            key_hash,
            request_hash,
            expires_at
          )
          VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')
          ON CONFLICT (scope, key_hash) DO NOTHING;
        `,
        [scope, keyHash, requestHash]
      );

      const claimed = await client.query<{
        request_hash: string;
        resource_id: string | null;
        response_body: CommandResponse | null;
      }>(
        `
          SELECT request_hash, resource_id::text, response_body
          FROM idempotency_keys
          WHERE scope = $1 AND key_hash = $2
          FOR UPDATE;
        `,
        [scope, keyHash]
      );
      const existing = claimed.rows[0];
      if (!existing || existing.request_hash !== requestHash) {
        throw new AppError(
          'Idempotency key was already used with a different payload',
          409,
          'IDEMPOTENCY_CONFLICT'
        );
      }
      if (existing.resource_id && existing.response_body) {
        await client.query('COMMIT');
        return existing.response_body;
      }

      const contact = await this.resolveContact(client, input.recipient);
      const logicalId = randomUUID();
      const scheduledAt = input.scheduledAt ?? null;
      const initialQueueState: OutboxState = scheduledAt
        ? 'scheduled'
        : 'queued';
      const message = await client.query<{ id: string }>(
        `
          INSERT INTO messages (
            logical_id,
            client_request_id,
            contact_id,
            direction,
            message_type,
            content,
            status,
            priority,
            scheduled_at,
            queued_at,
            metadata,
            updated_at
          )
          VALUES (
            $1::uuid,
            $2,
            $3::bigint,
            'outgoing',
            'text',
            $4,
            'accepted',
            $5,
            $6::timestamptz,
            NOW(),
            $7::jsonb,
            NOW()
          )
          RETURNING id::text;
        `,
        [
          logicalId,
          input.idempotencyKey,
          contact.id,
          input.text,
          input.priority,
          scheduledAt,
          JSON.stringify({ source: 'control_panel' })
        ]
      );
      const messageId = message.rows[0].id;
      const outboxId = randomUUID();
      await client.query(
        `
          INSERT INTO outbox_messages (
            id,
            message_id,
            state,
            next_attempt_at
          )
          VALUES (
            $1::uuid,
            $2::bigint,
            $3,
            COALESCE($4::timestamptz, NOW())
          );
        `,
        [outboxId, messageId, initialQueueState, scheduledAt]
      );
      await this.appendEvent(client, messageId, 'accepted', null, {
        source: 'control_panel'
      });
      await this.appendEvent(client, messageId, initialQueueState);

      const responseBody: CommandResponse = {
        id: logicalId,
        outboxId,
        state: 'accepted'
      };
      await client.query(
        `
          UPDATE idempotency_keys
          SET
            resource_id = $3::bigint,
            response_status = 202,
            response_body = $4::jsonb
          WHERE scope = $1 AND key_hash = $2;
        `,
        [scope, keyHash, messageId, JSON.stringify(responseBody)]
      );
      await client.query('COMMIT');
      return responseBody;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getMessage(logicalId: string) {
    if (!isUuid(logicalId)) return null;
    const message = await pool.query<{
      id: string;
      logical_id: string;
      direction: 'incoming' | 'outgoing';
      message_type: string;
      content: string | null;
      status: string;
      priority: MessagePriority;
      whatsapp_message_id: string | null;
      scheduled_at: Date | null;
      queued_at: Date | null;
      sending_at: Date | null;
      sent_at: Date | null;
      delivered_at: Date | null;
      read_at: Date | null;
      failed_at: Date | null;
      error_code: string | null;
      error_message: string | null;
      created_at: Date;
      updated_at: Date;
      contact_id: string;
      display_name: string | null;
      phone_number: string | null;
      outbox_id: string | null;
      outbox_state: OutboxState | null;
      attempts: number | null;
      max_attempts: number | null;
      next_attempt_at: Date | null;
    }>(
      `
        SELECT
          messages.id::text,
          messages.logical_id::text,
          messages.direction,
          messages.message_type,
          messages.content,
          messages.status,
          messages.priority,
          messages.whatsapp_message_id,
          messages.scheduled_at,
          messages.queued_at,
          messages.sending_at,
          messages.sent_at,
          messages.delivered_at,
          messages.read_at,
          messages.failed_at,
          messages.error_code,
          messages.error_message,
          messages.created_at,
          messages.updated_at,
          contacts.id::text AS contact_id,
          contacts.display_name,
          contacts.phone_number,
          outbox.id::text AS outbox_id,
          outbox.state AS outbox_state,
          outbox.attempts,
          outbox.max_attempts,
          outbox.next_attempt_at
        FROM messages
        INNER JOIN contacts ON contacts.id = messages.contact_id
        LEFT JOIN outbox_messages outbox ON outbox.message_id = messages.id
        WHERE messages.logical_id = $1::uuid
        LIMIT 1;
      `,
      [logicalId]
    );
    const row = message.rows[0];
    if (!row) return null;
    const events = await pool.query<{
      id: string;
      event_type: string;
      reason_code: string | null;
      metadata: Record<string, unknown>;
      occurred_at: Date;
    }>(
      `
        SELECT
          id::text,
          event_type,
          reason_code,
          metadata,
          occurred_at
        FROM message_events
        WHERE message_id = $1::bigint
        ORDER BY occurred_at ASC, id ASC;
      `,
      [row.id]
    );

    return {
      message: {
        id: row.logical_id,
        direction: row.direction,
        messageType: row.message_type,
        content: row.content,
        state: row.status,
        priority: row.priority,
        providerMessageId: row.whatsapp_message_id,
        recipient: {
          contactId: row.contact_id,
          displayName: row.display_name,
          maskedPhone: row.phone_number
            ? maskPhoneNumber(row.phone_number)
            : null
        },
        scheduledAt: row.scheduled_at?.toISOString() ?? null,
        queuedAt: row.queued_at?.toISOString() ?? null,
        sendingAt: row.sending_at?.toISOString() ?? null,
        sentAt: row.sent_at?.toISOString() ?? null,
        deliveredAt: row.delivered_at?.toISOString() ?? null,
        readAt: row.read_at?.toISOString() ?? null,
        failedAt: row.failed_at?.toISOString() ?? null,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString()
      },
      outbox: row.outbox_id
        ? {
            id: row.outbox_id,
            state: row.outbox_state,
            attempts: row.attempts,
            maxAttempts: row.max_attempts,
            nextAttemptAt: row.next_attempt_at?.toISOString() ?? null
          }
        : null,
      events: events.rows.map((event) => ({
        id: event.id,
        eventType: event.event_type,
        reasonCode: event.reason_code,
        metadata: event.metadata,
        occurredAt: event.occurred_at.toISOString()
      }))
    };
  }

  async listOutbox(input: {
    state?: OutboxState | 'all';
    cursor?: string;
    limit?: number;
  }) {
    const cursor = decodeCursor(input.cursor);
    const limit = Math.max(1, Math.min(input.limit ?? 30, 100));
    const result = await pool.query<{
      id: string;
      message_id: string;
      logical_id: string;
      state: OutboxState;
      message_state: string;
      priority: MessagePriority;
      attempts: number;
      max_attempts: number;
      next_attempt_at: Date;
      last_error_code: string | null;
      created_at: Date;
      updated_at: Date;
      display_name: string | null;
      phone_number: string | null;
      content: string | null;
    }>(
      `
        SELECT
          outbox.id::text,
          outbox.message_id::text,
          messages.logical_id::text,
          outbox.state,
          messages.status AS message_state,
          messages.priority,
          outbox.attempts,
          outbox.max_attempts,
          outbox.next_attempt_at,
          outbox.last_error_code,
          outbox.created_at,
          outbox.updated_at,
          contacts.display_name,
          contacts.phone_number,
          messages.content
        FROM outbox_messages outbox
        INNER JOIN messages ON messages.id = outbox.message_id
        INNER JOIN contacts ON contacts.id = messages.contact_id
        WHERE ($1::text = 'all' OR outbox.state = $1)
          AND (
            $2::timestamptz IS NULL
            OR outbox.created_at < $2
            OR (
              outbox.created_at = $2
              AND outbox.message_id < $3::bigint
            )
          )
        ORDER BY outbox.created_at DESC, outbox.message_id DESC
        LIMIT $4;
      `,
      [
        input.state ?? 'all',
        cursor?.occurredAt ?? null,
        cursor?.id ?? null,
        limit + 1
      ]
    );
    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);
    return {
      data: rows.map((row) => ({
        id: row.id,
        messageId: row.logical_id,
        state: row.state,
        messageState: row.message_state,
        priority: row.priority,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        nextAttemptAt: row.next_attempt_at.toISOString(),
        lastErrorCode: row.last_error_code,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        contact: {
          displayName: row.display_name,
          maskedPhone: row.phone_number
            ? maskPhoneNumber(row.phone_number)
            : null
        },
        preview: (row.content ?? '').replace(/\s+/g, ' ').slice(0, 120)
      })),
      nextCursor:
        hasMore && last
          ? encodeCursor({
              occurredAt: last.created_at.toISOString(),
              id: last.message_id
            })
          : null
    };
  }

  async cancel(outboxId: string): Promise<string | null> {
    if (!isUuid(outboxId)) return null;
    return this.transitionCommand(outboxId, 'cancel');
  }

  async retry(outboxId: string): Promise<string | null> {
    if (!isUuid(outboxId)) return null;
    return this.transitionCommand(outboxId, 'retry');
  }

  async reconcileUnknown(
    outboxId: string,
    resolution: 'confirmed_sent' | 'confirmed_not_sent',
    providerMessageId?: string | null
  ): Promise<{ messageId: string; state: 'completed' | 'failed' } | null> {
    if (!isUuid(outboxId)) return null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<{
        message_id: string;
        logical_id: string;
        state: OutboxState;
      }>(
        `
          SELECT
            outbox.message_id::text,
            messages.logical_id::text,
            outbox.state
          FROM outbox_messages outbox
          INNER JOIN messages ON messages.id = outbox.message_id
          WHERE outbox.id = $1::uuid
          FOR UPDATE;
        `,
        [outboxId]
      );
      const row = current.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return null;
      }
      if (row.state !== 'unknown_outcome') {
        throw new AppError(
          'Only an unknown outcome can be reconciled',
          409,
          'OUTBOX_STATE_CONFLICT',
          { state: row.state }
        );
      }
      const outboxState = resolution === 'confirmed_sent' ? 'completed' : 'failed';
      const messageState = resolution === 'confirmed_sent' ? 'sent' : 'failed';
      await client.query(
        `
          UPDATE outbox_messages
          SET
            state = $2::text,
            last_error_code = CASE
              WHEN $2::text = 'completed' THEN NULL
              ELSE 'RECONCILED_NOT_SENT'
            END,
            updated_at = NOW()
          WHERE id = $1::uuid;
        `,
        [outboxId, outboxState]
      );
      await client.query(
        `
          UPDATE messages
          SET
            status = $2::text,
            whatsapp_message_id = CASE
              WHEN $2::text = 'sent' THEN COALESCE($3, whatsapp_message_id)
              ELSE whatsapp_message_id
            END,
            sent_at = CASE WHEN $2::text = 'sent' THEN NOW() ELSE sent_at END,
            failed_at = CASE WHEN $2::text = 'failed' THEN NOW() ELSE failed_at END,
            error_code = CASE
              WHEN $2::text = 'sent' THEN NULL
              ELSE 'RECONCILED_NOT_SENT'
            END,
            error_message = NULL,
            updated_at = NOW()
          WHERE id = $1::bigint;
        `,
        [row.message_id, messageState, providerMessageId ?? null]
      );
      await this.appendEvent(
        client,
        row.message_id,
        resolution === 'confirmed_sent'
          ? 'reconciled_sent'
          : 'reconciled_not_sent',
        'OPERATOR_RECONCILIATION',
        { providerMessageId: providerMessageId ?? null }
      );
      await client.query('COMMIT');
      return { messageId: row.logical_id, state: outboxState };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async claimNext(workerId: string, leaseMs: number): Promise<ClaimedOutboxItem | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await this.recoverStaleLeases(client);
      const claimed = await client.query<{
        id: string;
        message_id: string;
        attempts: number;
        max_attempts: number;
        logical_id: string;
        content: string;
        whatsapp_jid: string;
      }>(
        `
          WITH candidate AS (
            SELECT id
            FROM outbox_messages
            WHERE state IN ('queued', 'scheduled', 'retrying', 'safety_delayed')
              AND next_attempt_at <= NOW()
              AND attempts < max_attempts
            ORDER BY
              CASE
                WHEN (
                  SELECT priority
                  FROM messages
                  WHERE messages.id = outbox_messages.message_id
                ) = 'high' THEN 0
                WHEN (
                  SELECT priority
                  FROM messages
                  WHERE messages.id = outbox_messages.message_id
                ) = 'normal' THEN 1
                ELSE 2
              END,
              next_attempt_at,
              created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          ),
          claimed AS (
            UPDATE outbox_messages
            SET
              state = 'leased',
              attempts = attempts + 1,
              lease_owner = $1,
              lease_expires_at = NOW() + ($2::text || ' milliseconds')::interval,
              updated_at = NOW()
            WHERE id = (SELECT id FROM candidate)
            RETURNING *
          )
          SELECT
            claimed.id::text,
            claimed.message_id::text,
            claimed.attempts,
            claimed.max_attempts,
            messages.logical_id::text,
            messages.content,
            contacts.whatsapp_jid
          FROM claimed
          INNER JOIN messages ON messages.id = claimed.message_id
          INNER JOIN contacts ON contacts.id = messages.contact_id;
        `,
        [workerId, leaseMs]
      );
      const row = claimed.rows[0];
      if (!row) {
        await client.query('COMMIT');
        return null;
      }
      await client.query(
        `
          UPDATE messages
          SET status = 'sending', sending_at = NOW(), updated_at = NOW()
          WHERE id = $1::bigint;
        `,
        [row.message_id]
      );
      await this.appendEvent(client, row.message_id, 'sending', null, {
        attempt: row.attempts
      });
      await client.query('COMMIT');
      return {
        outboxId: row.id,
        messageId: row.message_id,
        logicalMessageId: row.logical_id,
        jid: row.whatsapp_jid,
        text: row.content,
        attempt: row.attempts,
        maxAttempts: row.max_attempts
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async defer(
    item: ClaimedOutboxItem,
    reasonCode: string,
    delayMs: number,
    safetyDelay = false,
    reasonDetail?: { message: string; recommendation: string }
  ): Promise<void> {
    const exhausted = !safetyDelay && item.attempt >= item.maxAttempts;
    const state: OutboxState = exhausted
      ? 'failed'
      : safetyDelay
        ? 'safety_delayed'
        : 'retrying';
    const eventType = exhausted ? 'failed' : state;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const transitioned = await client.query<{ message_id: string }>(
        `
          UPDATE outbox_messages
          SET
            state = $2::text,
            attempts = CASE
              WHEN $5::boolean THEN GREATEST(0, attempts - 1)
              ELSE attempts
            END,
            next_attempt_at = NOW() + ($3::text || ' milliseconds')::interval,
            lease_owner = NULL,
            lease_expires_at = NULL,
            last_error_code = $4,
            updated_at = NOW()
          WHERE id = $1::uuid AND state = 'leased'
          RETURNING message_id::text;
        `,
        [item.outboxId, state, delayMs, reasonCode, safetyDelay]
      );
      if (!transitioned.rows[0]) {
        await client.query('COMMIT');
        return;
      }
      await client.query(
        `
          UPDATE messages
          SET
            status = $2::text,
            error_code = $3,
            error_message = NULL,
            failed_at = CASE WHEN $2::text = 'failed' THEN NOW() ELSE failed_at END,
            updated_at = NOW()
          WHERE id = $1::bigint;
        `,
        [item.messageId, state, reasonCode]
      );
      await this.appendEvent(client, item.messageId, eventType, reasonCode, {
        attempt: item.attempt,
        nextAttemptInMs: exhausted ? null : delayMs,
        ...(reasonDetail ?? {})
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deferNextForSafety(
    reasonCode: string,
    delayMs: number,
    reasonDetail: { message: string; recommendation: string }
  ): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const deferred = await client.query<{
        message_id: string;
      }>(
        `
          WITH candidate AS (
            SELECT id
            FROM outbox_messages
            WHERE state IN ('queued', 'scheduled', 'retrying', 'safety_delayed')
              AND next_attempt_at <= NOW()
            ORDER BY next_attempt_at, created_at
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          UPDATE outbox_messages
          SET
            state = 'safety_delayed',
            next_attempt_at = NOW() + ($1::text || ' milliseconds')::interval,
            last_error_code = $2,
            updated_at = NOW()
          WHERE id = (SELECT id FROM candidate)
          RETURNING message_id::text;
        `,
        [delayMs, reasonCode]
      );
      const row = deferred.rows[0];
      if (!row) {
        await client.query('COMMIT');
        return false;
      }
      await client.query(
        `
          UPDATE messages
          SET
            status = 'safety_delayed',
            error_code = $2,
            error_message = NULL,
            updated_at = NOW()
          WHERE id = $1::bigint;
        `,
        [row.message_id, reasonCode]
      );
      await this.appendEvent(
        client,
        row.message_id,
        'safety_delayed',
        reasonCode,
        {
          nextAttemptInMs: delayMs,
          ...reasonDetail
        }
      );
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getRecentSafetyDelays(limit = 20) {
    const result = await pool.query<{
      id: string;
      logical_id: string;
      outbox_id: string | null;
      reason_code: string;
      metadata: Record<string, unknown>;
      occurred_at: Date;
    }>(
      `
        SELECT
          events.id::text,
          messages.logical_id::text,
          outbox.id::text AS outbox_id,
          events.reason_code,
          events.metadata,
          events.occurred_at
        FROM message_events events
        INNER JOIN messages ON messages.id = events.message_id
        LEFT JOIN outbox_messages outbox ON outbox.message_id = messages.id
        WHERE events.event_type = 'safety_delayed'
          AND events.reason_code IS NOT NULL
        ORDER BY events.occurred_at DESC, events.id DESC
        LIMIT $1;
      `,
      [Math.max(1, Math.min(limit, 100))]
    );
    return result.rows.map((row) => ({
      id: row.id,
      messageId: row.logical_id,
      outboxId: row.outbox_id,
      reasonCode: row.reason_code,
      message:
        typeof row.metadata.message === 'string' ? row.metadata.message : null,
      recommendation:
        typeof row.metadata.recommendation === 'string'
          ? row.metadata.recommendation
          : null,
      nextAttemptInMs:
        typeof row.metadata.nextAttemptInMs === 'number'
          ? row.metadata.nextAttemptInMs
          : null,
      occurredAt: row.occurred_at.toISOString()
    }));
  }

  async complete(
    item: ClaimedOutboxItem,
    providerMessageId: string | null
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const transitioned = await client.query<{ message_id: string }>(
        `
          UPDATE outbox_messages
          SET
            state = 'completed',
            lease_owner = NULL,
            lease_expires_at = NULL,
            last_error_code = NULL,
            updated_at = NOW()
          WHERE id = $1::uuid AND state = 'leased'
          RETURNING message_id::text;
        `,
        [item.outboxId]
      );
      if (!transitioned.rows[0]) {
        await client.query('COMMIT');
        return;
      }
      await client.query(
        `
          UPDATE messages
          SET
            whatsapp_message_id = $2,
            status = 'sent',
            sent_at = NOW(),
            error_code = NULL,
            error_message = NULL,
            updated_at = NOW()
          WHERE id = $1::bigint;
        `,
        [item.messageId, providerMessageId]
      );
      await this.appendEvent(client, item.messageId, 'sent', null, {
        providerMessageId
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async markUnknown(
    item: ClaimedOutboxItem,
    error: unknown
  ): Promise<void> {
    const message = sanitizeOperationalError(error, 'Unknown send error');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const transitioned = await client.query<{ message_id: string }>(
        `
          UPDATE outbox_messages
          SET
            state = 'unknown_outcome',
            lease_owner = NULL,
            lease_expires_at = NULL,
            last_error_code = 'PROVIDER_OUTCOME_UNKNOWN',
            updated_at = NOW()
          WHERE id = $1::uuid AND state = 'leased'
          RETURNING message_id::text;
        `,
        [item.outboxId]
      );
      if (!transitioned.rows[0]) {
        await client.query('COMMIT');
        return;
      }
      await client.query(
        `
          UPDATE messages
          SET
            status = 'unknown_outcome',
            error_code = 'PROVIDER_OUTCOME_UNKNOWN',
            error_message = $2,
            updated_at = NOW()
          WHERE id = $1::bigint;
        `,
        [item.messageId, message]
      );
      await this.appendEvent(
        client,
        item.messageId,
        'unknown_outcome',
        'PROVIDER_OUTCOME_UNKNOWN',
        { attempt: item.attempt }
      );
      await client.query('COMMIT');
    } catch (markError) {
      await client.query('ROLLBACK');
      throw markError;
    } finally {
      client.release();
    }
  }

  async getSummary() {
    const result = await pool.query<{
      queued: string;
      retrying: string;
      failed: string;
      oldest_age_ms: string;
    }>(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE state IN ('queued', 'scheduled', 'safety_delayed')
          )::text AS queued,
          COUNT(*) FILTER (WHERE state = 'retrying')::text AS retrying,
          COUNT(*) FILTER (
            WHERE state IN ('failed', 'unknown_outcome')
          )::text AS failed,
          COALESCE(
            EXTRACT(
              EPOCH FROM (
                NOW() - MIN(created_at) FILTER (
                  WHERE state IN (
                    'queued',
                    'scheduled',
                    'safety_delayed',
                    'retrying'
                  )
                )
              )
            ) * 1000,
            0
          )::text AS oldest_age_ms
        FROM outbox_messages;
      `
    );
    const row = result.rows[0];
    return {
      queued: Number(row.queued),
      retrying: Number(row.retrying),
      failed: Number(row.failed),
      oldestAgeMs: Math.max(0, Number(row.oldest_age_ms))
    };
  }

  private async resolveContact(
    client: PoolClient,
    recipient: CreateMessageInput['recipient']
  ): Promise<{ id: string }> {
    if (recipient.contactId) {
      const existing = await client.query<{ id: string }>(
        'SELECT id::text FROM contacts WHERE id = $1::bigint LIMIT 1;',
        [recipient.contactId]
      );
      if (!existing.rows[0]) {
        throw new AppError(
          'Recipient contact was not found',
          404,
          'CONTACT_NOT_FOUND'
        );
      }
      return existing.rows[0];
    }
    const phone = normalizePhoneNumber(recipient.phone ?? '');
    if (!validatePhoneNumber(phone)) {
      throw new AppError(
        'Recipient phone number is invalid',
        400,
        'INVALID_RECIPIENT'
      );
    }
    return new MessageService(client).upsertContact({
      whatsappJid: toWhatsAppJid(phone)
    });
  }

  private async transitionCommand(
    outboxId: string,
    action: 'cancel' | 'retry'
  ): Promise<string | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<{
        message_id: string;
        logical_id: string;
        state: OutboxState;
        attempts: number;
      }>(
        `
          SELECT
            outbox.message_id::text,
            messages.logical_id::text,
            outbox.state,
            outbox.attempts
          FROM outbox_messages outbox
          INNER JOIN messages ON messages.id = outbox.message_id
          WHERE outbox.id = $1::uuid
          FOR UPDATE;
        `,
        [outboxId]
      );
      const row = current.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return null;
      }
      if (
        action === 'cancel' &&
        !['queued', 'scheduled', 'retrying', 'safety_delayed'].includes(
          row.state
        )
      ) {
        throw new AppError(
          'Outbox item cannot be canceled from its current state',
          409,
          'OUTBOX_STATE_CONFLICT',
          { state: row.state }
        );
      }
      if (action === 'retry' && row.state !== 'failed') {
        throw new AppError(
          'Only a failed outbox item can be retried',
          409,
          'OUTBOX_STATE_CONFLICT',
          { state: row.state }
        );
      }

      const target = action === 'cancel' ? 'canceled' : 'queued';
      await client.query(
        `
          UPDATE outbox_messages
          SET
            state = $2::text,
            next_attempt_at = CASE WHEN $2::text = 'queued' THEN NOW() ELSE next_attempt_at END,
            max_attempts = CASE
              WHEN $2::text = 'queued' THEN GREATEST(max_attempts, attempts + 3)
              ELSE max_attempts
            END,
            last_error_code = CASE WHEN $2::text = 'queued' THEN NULL ELSE last_error_code END,
            updated_at = NOW()
          WHERE id = $1::uuid;
        `,
        [outboxId, target]
      );
      await client.query(
        `
          UPDATE messages
          SET
            status = $2::text,
            error_code = CASE WHEN $2::text = 'queued' THEN NULL ELSE error_code END,
            error_message = CASE WHEN $2::text = 'queued' THEN NULL ELSE error_message END,
            updated_at = NOW()
          WHERE id = $1::bigint;
        `,
        [row.message_id, target]
      );
      await this.appendEvent(
        client,
        row.message_id,
        action === 'cancel' ? 'canceled' : 'queued',
        action === 'retry' ? 'OPERATOR_RETRY' : 'OPERATOR_CANCELED'
      );
      await client.query('COMMIT');
      return row.logical_id;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async recoverStaleLeases(client: PoolClient): Promise<void> {
    const stale = await client.query<{ message_id: string }>(
      `
        UPDATE outbox_messages
        SET
          state = 'unknown_outcome',
          lease_owner = NULL,
          lease_expires_at = NULL,
          last_error_code = 'STALE_LEASE_OUTCOME_UNKNOWN',
          updated_at = NOW()
        WHERE state = 'leased'
          AND lease_expires_at <= NOW()
        RETURNING message_id::text;
      `
    );
    for (const row of stale.rows) {
      await client.query(
        `
          UPDATE messages
          SET
            status = 'unknown_outcome',
            error_code = 'STALE_LEASE_OUTCOME_UNKNOWN',
            error_message = 'Worker lease expired after send processing began.',
            updated_at = NOW()
          WHERE id = $1::bigint;
        `,
        [row.message_id]
      );
      await this.appendEvent(
        client,
        row.message_id,
        'unknown_outcome',
        'STALE_LEASE_OUTCOME_UNKNOWN'
      );
    }
  }

  private async appendEvent(
    client: Pick<PoolClient, 'query'>,
    messageId: string,
    eventType: string,
    reasonCode: string | null = null,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO message_events (
          message_id,
          event_type,
          reason_code,
          metadata
        )
        VALUES ($1::bigint, $2, $3, $4::jsonb);
      `,
      [messageId, eventType, reasonCode, JSON.stringify(metadata)]
    );
  }
}
