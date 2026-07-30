import type { QueryResult, QueryResultRow } from 'pg';
import { pool } from '../database/connection.js';
import { phoneFromJid } from '../utils/phone.js';
import { randomUUID } from 'node:crypto';

export type QueryExecutor = {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<Row>>;
};

type UpsertContactInput = {
  whatsappJid: string;
  displayName?: string | null;
};

type SaveMessageInput = {
  whatsappMessageId?: string | null;
  whatsappJid: string;
  direction: 'incoming' | 'outgoing';
  content: string;
  messageType?: string;
  status?: string;
  displayName?: string | null;
};

export class MessageService {
  constructor(private readonly database: QueryExecutor = pool) {}

  async upsertContact(input: UpsertContactInput): Promise<{ id: string; phoneNumber: string }> {
    const phoneNumber = phoneFromJid(input.whatsappJid);
    const isPnJid = input.whatsappJid.endsWith('@s.whatsapp.net');
    const isLidJid = input.whatsappJid.endsWith('@lid');
    const result = await this.database.query<{
      id: string;
      phone_number: string;
    }>(
      `
        INSERT INTO contacts (
          whatsapp_jid,
          phone_number,
          display_name,
          pn_jid,
          lid_jid,
          canonical_jid,
          identity_status,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (whatsapp_jid)
        DO UPDATE SET
          phone_number = EXCLUDED.phone_number,
          display_name = COALESCE(EXCLUDED.display_name, contacts.display_name),
          pn_jid = COALESCE(EXCLUDED.pn_jid, contacts.pn_jid),
          lid_jid = COALESCE(EXCLUDED.lid_jid, contacts.lid_jid),
          canonical_jid = COALESCE(EXCLUDED.canonical_jid, contacts.canonical_jid),
          identity_status = CASE
            WHEN contacts.identity_status = 'conflict' THEN 'conflict'
            ELSE EXCLUDED.identity_status
          END,
          updated_at = NOW()
        RETURNING id, phone_number;
      `,
      [
        input.whatsappJid,
        phoneNumber,
        input.displayName ?? null,
        isPnJid ? input.whatsappJid : null,
        isLidJid ? input.whatsappJid : null,
        isPnJid ? input.whatsappJid : null,
        isPnJid ? 'resolved' : 'unresolved'
      ]
    );

    return {
      id: result.rows[0].id,
      phoneNumber: result.rows[0].phone_number
    };
  }

  async saveMessage(input: SaveMessageInput): Promise<{ inserted: boolean }> {
    const contact = await this.upsertContact({
      whatsappJid: input.whatsappJid,
      displayName: input.displayName
    });

    const result = await this.database.query<{ id: string }>(
      `
        INSERT INTO messages (
          whatsapp_message_id,
          contact_id,
          direction,
          message_type,
          content,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (whatsapp_message_id) DO NOTHING
        RETURNING id;
      `,
      [
        input.whatsappMessageId ?? null,
        contact.id,
        input.direction,
        input.messageType ?? 'text',
        input.content,
        input.status ?? (input.direction === 'incoming' ? 'received' : 'sent')
      ]
    );

    const inserted = (result.rowCount ?? 0) > 0;

    if (input.direction === 'incoming' && input.content.trim() === '5') {
      let sourceMessageId = result.rows[0]?.id;

      if (!sourceMessageId && input.whatsappMessageId) {
        const existing = await this.database.query<{ id: string }>(
          `
            SELECT id::text
            FROM messages
            WHERE whatsapp_message_id = $1
            LIMIT 1;
          `,
          [input.whatsappMessageId]
        );
        sourceMessageId = existing.rows[0]?.id;
      }

      if (sourceMessageId) {
        await this.database.query(
          `
            INSERT INTO handoff_tasks (
              id,
              contact_id,
              source_message_id,
              due_at
            )
            VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')
            ON CONFLICT (source_message_id) DO NOTHING;
          `,
          [randomUUID(), contact.id, sourceMessageId]
        );
      }
    }

    return { inserted };
  }
}
