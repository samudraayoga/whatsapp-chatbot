import { pool } from '../database/connection.js';
import { maskPhoneNumber } from '../utils/phone.js';
import {
  decodeCursor,
  encodeCursor,
  escapeLikePattern
} from '../utils/cursor.js';
import type { QueryExecutor } from './message.service.js';

export type Page<T> = {
  data: T[];
  nextCursor: string | null;
};

type ConversationRow = {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  identity_status: 'resolved' | 'unresolved' | 'conflict';
  last_message_id: string;
  last_message_at: Date;
  last_message_type: string;
  last_message_content: string | null;
  last_message_direction: 'incoming' | 'outgoing';
  last_outgoing_status: string | null;
  incoming_count: string;
  outgoing_count: string;
};

type MessageRow = {
  id: string;
  cursor_id: string;
  whatsapp_message_id: string | null;
  direction: 'incoming' | 'outgoing';
  message_type: string;
  content: string | null;
  status: string;
  created_at: Date;
};

type ContactRow = {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  whatsapp_jid: string;
  pn_jid: string | null;
  lid_jid: string | null;
  canonical_jid: string | null;
  identity_status: 'resolved' | 'unresolved' | 'conflict';
  incoming_count: string;
  outgoing_count: string;
  last_outgoing_status: string | null;
  last_interaction_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const normalizeLimit = (limit: number | undefined): number =>
  Math.max(1, Math.min(limit ?? 30, 100));

const previewMessage = (
  messageType: string,
  content: string | null
): string => {
  if (messageType !== 'text') return `[Unsupported: ${messageType}]`;
  const normalized = content?.replace(/\s+/g, ' ').trim() ?? '';
  return normalized.length > 120 ? `${normalized.slice(0, 117)}…` : normalized;
};

const maskJid = (jid: string | null): string | null => {
  if (!jid) return null;
  const [user, server] = jid.split('@');
  return `${maskPhoneNumber(user)}@${server ?? 'unknown'}`;
};

const contactFromRow = (row: ContactRow) => ({
  id: row.id,
  displayName: row.display_name,
  maskedPhone: row.phone_number ? maskPhoneNumber(row.phone_number) : null,
  identity: {
    status: row.identity_status,
    whatsappJid: maskJid(row.whatsapp_jid),
    pnJid: maskJid(row.pn_jid),
    lidJid: maskJid(row.lid_jid),
    canonicalJid: maskJid(row.canonical_jid)
  },
  counts: {
    incoming: Number(row.incoming_count),
    outgoing: Number(row.outgoing_count)
  },
  lastOutgoingStatus: row.last_outgoing_status,
  lastInteractionAt: row.last_interaction_at?.toISOString() ?? null,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString()
});

export class ReadModelService {
  constructor(private readonly database: QueryExecutor = pool) {}

  async listConversations(input: {
    query?: string;
    status?: 'all' | 'has_failure' | 'identity_warning';
    cursor?: string;
    limit?: number;
  }): Promise<Page<ReturnType<typeof this.conversationFromRow>>> {
    const limit = normalizeLimit(input.limit);
    const cursor = decodeCursor(input.cursor);
    const search = input.query?.trim()
      ? escapeLikePattern(input.query.trim())
      : null;
    const result = await this.database.query<ConversationRow>(
      `
        SELECT
          contacts.id::text,
          contacts.display_name,
          contacts.phone_number,
          contacts.identity_status,
          COALESCE(latest.logical_id::text, latest.id::text) AS last_message_id,
          latest.created_at AS last_message_at,
          latest.message_type AS last_message_type,
          latest.content AS last_message_content,
          latest.direction AS last_message_direction,
          counts.last_outgoing_status,
          counts.incoming_count::text,
          counts.outgoing_count::text
        FROM contacts
        INNER JOIN LATERAL (
          SELECT id, logical_id, created_at, message_type, content, direction
          FROM messages
          WHERE messages.contact_id = contacts.id
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        ) latest ON TRUE
        INNER JOIN LATERAL (
          SELECT
            COUNT(*) FILTER (WHERE direction = 'incoming') AS incoming_count,
            COUNT(*) FILTER (WHERE direction = 'outgoing') AS outgoing_count,
            (
              SELECT status
              FROM messages outgoing
              WHERE outgoing.contact_id = contacts.id
                AND outgoing.direction = 'outgoing'
              ORDER BY outgoing.created_at DESC, outgoing.id DESC
              LIMIT 1
            ) AS last_outgoing_status
          FROM messages
          WHERE messages.contact_id = contacts.id
        ) counts ON TRUE
        WHERE NOT EXISTS (
          SELECT 1
          FROM ai_conversations playground_conversation
          WHERE playground_conversation.contact_id = contacts.id
            AND playground_conversation.channel = 'playground'
        )
          AND (
          $1::text IS NULL
          OR contacts.display_name ILIKE '%' || $1 || '%' ESCAPE '\\'
          OR contacts.phone_number ILIKE '%' || $1 || '%' ESCAPE '\\'
        )
          AND (
            $2::text = 'all'
            OR ($2 = 'identity_warning' AND contacts.identity_status <> 'resolved')
            OR (
              $2 = 'has_failure'
              AND EXISTS (
                SELECT 1 FROM messages failed
                WHERE failed.contact_id = contacts.id
                  AND failed.status = 'failed'
              )
            )
          )
          AND (
            $3::timestamptz IS NULL
            OR latest.created_at < $3
            OR (latest.created_at = $3 AND contacts.id < $4::bigint)
          )
        ORDER BY latest.created_at DESC, contacts.id DESC
        LIMIT $5;
      `,
      [
        search,
        input.status ?? 'all',
        cursor?.occurredAt ?? null,
        cursor?.id ?? null,
        limit + 1
      ]
    );

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);
    return {
      data: rows.map((row) => this.conversationFromRow(row)),
      nextCursor:
        hasMore && last
          ? encodeCursor({
              occurredAt: last.last_message_at.toISOString(),
              id: last.id
            })
          : null
    };
  }

  async listMessages(input: {
    contactId: string;
    cursor?: string;
    limit?: number;
  }): Promise<Page<ReturnType<typeof this.messageFromRow>>> {
    const limit = normalizeLimit(input.limit);
    const cursor = decodeCursor(input.cursor);
    const result = await this.database.query<MessageRow>(
      `
        SELECT
          COALESCE(logical_id::text, id::text) AS id,
          id::text AS cursor_id,
          whatsapp_message_id,
          direction,
          message_type,
          content,
          status,
          created_at
        FROM messages
        WHERE contact_id = $1::bigint
          AND (
            $2::timestamptz IS NULL
            OR created_at < $2
            OR (created_at = $2 AND id < $3::bigint)
          )
        ORDER BY created_at DESC, id DESC
        LIMIT $4;
      `,
      [
        input.contactId,
        cursor?.occurredAt ?? null,
        cursor?.id ?? null,
        limit + 1
      ]
    );

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);
    return {
      data: rows.map((row) => this.messageFromRow(row)),
      nextCursor:
        hasMore && last
          ? encodeCursor({
              occurredAt: last.created_at.toISOString(),
              id: last.cursor_id
            })
          : null
    };
  }

  async listContacts(input: {
    query?: string;
    cursor?: string;
    limit?: number;
  }): Promise<Page<ReturnType<typeof contactFromRow>>> {
    const limit = normalizeLimit(input.limit);
    const cursor = decodeCursor(input.cursor);
    const search = input.query?.trim()
      ? escapeLikePattern(input.query.trim())
      : null;
    const result = await this.database.query<ContactRow>(
      `
        SELECT
          contacts.id::text,
          contacts.display_name,
          contacts.phone_number,
          contacts.whatsapp_jid,
          contacts.pn_jid,
          contacts.lid_jid,
          contacts.canonical_jid,
          contacts.identity_status,
          COUNT(messages.id) FILTER (WHERE messages.direction = 'incoming')::text AS incoming_count,
          COUNT(messages.id) FILTER (WHERE messages.direction = 'outgoing')::text AS outgoing_count,
          (
            SELECT status
            FROM messages outgoing
            WHERE outgoing.contact_id = contacts.id
              AND outgoing.direction = 'outgoing'
            ORDER BY outgoing.created_at DESC, outgoing.id DESC
            LIMIT 1
          ) AS last_outgoing_status,
          MAX(messages.created_at) AS last_interaction_at,
          contacts.created_at,
          contacts.updated_at
        FROM contacts
        LEFT JOIN messages ON messages.contact_id = contacts.id
        WHERE (
          $1::text IS NULL
          OR contacts.display_name ILIKE '%' || $1 || '%' ESCAPE '\\'
          OR contacts.phone_number ILIKE '%' || $1 || '%' ESCAPE '\\'
        )
          AND (
            $2::timestamptz IS NULL
            OR contacts.updated_at < $2
            OR (contacts.updated_at = $2 AND contacts.id < $3::bigint)
          )
        GROUP BY contacts.id
        ORDER BY contacts.updated_at DESC, contacts.id DESC
        LIMIT $4;
      `,
      [search, cursor?.occurredAt ?? null, cursor?.id ?? null, limit + 1]
    );
    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);
    return {
      data: rows.map(contactFromRow),
      nextCursor:
        hasMore && last
          ? encodeCursor({
              occurredAt: last.updated_at.toISOString(),
              id: last.id
            })
          : null
    };
  }

  async getContact(contactId: string): Promise<ReturnType<typeof contactFromRow> | null> {
    const result = await this.database.query<ContactRow>(
      `
        SELECT
          contacts.id::text,
          contacts.display_name,
          contacts.phone_number,
          contacts.whatsapp_jid,
          contacts.pn_jid,
          contacts.lid_jid,
          contacts.canonical_jid,
          contacts.identity_status,
          COUNT(messages.id) FILTER (WHERE messages.direction = 'incoming')::text AS incoming_count,
          COUNT(messages.id) FILTER (WHERE messages.direction = 'outgoing')::text AS outgoing_count,
          (
            SELECT status
            FROM messages outgoing
            WHERE outgoing.contact_id = contacts.id
              AND outgoing.direction = 'outgoing'
            ORDER BY outgoing.created_at DESC, outgoing.id DESC
            LIMIT 1
          ) AS last_outgoing_status,
          MAX(messages.created_at) AS last_interaction_at,
          contacts.created_at,
          contacts.updated_at
        FROM contacts
        LEFT JOIN messages ON messages.contact_id = contacts.id
        WHERE contacts.id = $1::bigint
        GROUP BY contacts.id;
      `,
      [contactId]
    );
    return result.rows[0] ? contactFromRow(result.rows[0]) : null;
  }

  private conversationFromRow(row: ConversationRow) {
    return {
      id: row.id,
      displayName: row.display_name,
      maskedPhone: row.phone_number
        ? maskPhoneNumber(row.phone_number)
        : null,
      identityStatus: row.identity_status,
      lastMessage: {
        id: row.last_message_id,
        preview: previewMessage(
          row.last_message_type,
          row.last_message_content
        ),
        direction: row.last_message_direction,
        messageType: row.last_message_type,
        occurredAt: row.last_message_at.toISOString()
      },
      lastOutgoingStatus: row.last_outgoing_status,
      counts: {
        incoming: Number(row.incoming_count),
        outgoing: Number(row.outgoing_count)
      }
    };
  }

  private messageFromRow(row: MessageRow) {
    return {
      id: row.id,
      providerMessageId: row.whatsapp_message_id,
      direction: row.direction,
      messageType: row.message_type,
      content: row.message_type === 'text' ? row.content : null,
      state: row.status,
      createdAt: row.created_at.toISOString()
    };
  }
}
