import { pool } from './connection.js';
import { logger } from '../utils/logger.js';

export const runMigrations = async (): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id BIGSERIAL PRIMARY KEY,
        whatsapp_jid VARCHAR UNIQUE NOT NULL,
        phone_number VARCHAR,
        display_name VARCHAR,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id BIGSERIAL PRIMARY KEY,
        whatsapp_message_id VARCHAR UNIQUE,
        contact_id BIGINT REFERENCES contacts(id),
        direction VARCHAR NOT NULL,
        message_type VARCHAR DEFAULT 'text',
        content TEXT,
        status VARCHAR DEFAULT 'received',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_contact_id
      ON messages(contact_id);
    `);

    await client.query('COMMIT');
    logger.info('Database migration completed');
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : 'Unknown migration error';
    logger.error('Database migration failed', { error: message });
    throw error;
  } finally {
    client.release();
  }
};
