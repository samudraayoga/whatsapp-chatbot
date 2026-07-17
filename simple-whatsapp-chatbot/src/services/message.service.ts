import { pool } from '../database/connection.js';
import { phoneFromJid } from '../utils/phone.js';

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
  async upsertContact(input: UpsertContactInput): Promise<{ id: string; phoneNumber: string }> {
    const phoneNumber = phoneFromJid(input.whatsappJid);
    const result = await pool.query<{
      id: string;
      phone_number: string;
    }>(
      `
        INSERT INTO contacts (whatsapp_jid, phone_number, display_name, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (whatsapp_jid)
        DO UPDATE SET
          phone_number = EXCLUDED.phone_number,
          display_name = COALESCE(EXCLUDED.display_name, contacts.display_name),
          updated_at = NOW()
        RETURNING id, phone_number;
      `,
      [input.whatsappJid, phoneNumber, input.displayName ?? null]
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

    const result = await pool.query(
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

    return { inserted: (result.rowCount ?? 0) > 0 };
  }
}
