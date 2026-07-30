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
      ALTER TABLE contacts
        ADD COLUMN IF NOT EXISTS pn_jid VARCHAR,
        ADD COLUMN IF NOT EXISTS lid_jid VARCHAR,
        ADD COLUMN IF NOT EXISTS canonical_jid VARCHAR,
        ADD COLUMN IF NOT EXISTS identity_status VARCHAR(20) NOT NULL DEFAULT 'unresolved';
    `);

    await client.query(`
      UPDATE contacts
      SET
        pn_jid = COALESCE(pn_jid, whatsapp_jid),
        canonical_jid = COALESCE(canonical_jid, whatsapp_jid),
        identity_status = 'resolved'
      WHERE whatsapp_jid LIKE '%@s.whatsapp.net'
        AND identity_status = 'unresolved';
    `);

    await client.query(`
      UPDATE contacts
      SET
        lid_jid = COALESCE(lid_jid, whatsapp_jid),
        identity_status = 'unresolved'
      WHERE whatsapp_jid LIKE '%@lid';
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_contact_id
      ON messages(contact_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_contact_timeline
      ON messages(contact_id, created_at DESC, id DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_updated_timeline
      ON contacts(updated_at DESC, id DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_phone
      ON contacts(phone_number);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id UUID PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        display_name VARCHAR(150) NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(30) NOT NULL,
        permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES admin_users(id),
        token_hash CHAR(64) UNIQUE NOT NULL,
        csrf_token_hash CHAR(64) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id
      ON admin_sessions(user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at
      ON admin_sessions(expires_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGSERIAL PRIMARY KEY,
        actor_user_id UUID REFERENCES admin_users(id),
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(100) NOT NULL,
        resource_id TEXT,
        reason TEXT,
        before_state JSONB,
        after_state JSONB,
        request_id VARCHAR(100) NOT NULL,
        ip_address INET,
        user_agent TEXT,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred_at
      ON audit_logs(occurred_at DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS operational_events (
        id UUID PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_operational_events_occurred_at
      ON operational_events(occurred_at DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS handoff_tasks (
        id UUID PRIMARY KEY,
        contact_id BIGINT NOT NULL REFERENCES contacts(id),
        source_message_id BIGINT UNIQUE NOT NULL REFERENCES messages(id),
        state VARCHAR(20) NOT NULL DEFAULT 'open',
        assignee_user_id UUID REFERENCES admin_users(id),
        due_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,
        resolution_note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_handoff_tasks_state_timeline
      ON handoff_tasks(state, created_at DESC, id DESC);
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
