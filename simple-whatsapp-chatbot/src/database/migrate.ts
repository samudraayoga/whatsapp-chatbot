import { pool } from './connection.js';
import { logger } from '../utils/logger.js';
import {
  initialChatbotRules,
  validateChatbotRules
} from '../services/chatbot-rules.js';
import { createHash } from 'node:crypto';

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

    await client.query(`
      ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS logical_id UUID,
        ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(128),
        ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'normal',
        ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS sending_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS error_code VARCHAR(100),
        ADD COLUMN IF NOT EXISTS error_message TEXT,
        ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    await client.query(`
      UPDATE messages
      SET logical_id = gen_random_uuid()
      WHERE logical_id IS NULL;
    `);

    await client.query(`
      ALTER TABLE messages
        ALTER COLUMN logical_id SET DEFAULT gen_random_uuid(),
        ALTER COLUMN logical_id SET NOT NULL;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_logical_id
      ON messages(logical_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS outbox_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id BIGINT UNIQUE NOT NULL REFERENCES messages(id),
        state VARCHAR(30) NOT NULL DEFAULT 'queued',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        lease_owner VARCHAR(150),
        lease_expires_at TIMESTAMPTZ,
        last_error_code VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_outbox_eligible
      ON outbox_messages(state, next_attempt_at, created_at);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_outbox_timeline
      ON outbox_messages(created_at DESC, id DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS message_events (
        id BIGSERIAL PRIMARY KEY,
        message_id BIGINT NOT NULL REFERENCES messages(id),
        event_type VARCHAR(50) NOT NULL,
        reason_code VARCHAR(100),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_message_events_timeline
      ON message_events(message_id, occurred_at ASC, id ASC);
    `);

    await client.query(`
      INSERT INTO message_events (message_id, event_type, occurred_at)
      SELECT messages.id, 'legacy_imported', messages.created_at
      FROM messages
      WHERE NOT EXISTS (
        SELECT 1
        FROM message_events
        WHERE message_events.message_id = messages.id
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        scope VARCHAR(100) NOT NULL,
        key_hash CHAR(64) NOT NULL,
        request_hash CHAR(64) NOT NULL,
        resource_id BIGINT REFERENCES messages(id),
        response_status INTEGER,
        response_body JSONB,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (scope, key_hash)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at
      ON idempotency_keys(expires_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chatbot_rule_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        version_number INTEGER UNIQUE NOT NULL,
        name VARCHAR(150) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        change_summary TEXT,
        based_on_version_id UUID REFERENCES chatbot_rule_versions(id),
        revision INTEGER NOT NULL DEFAULT 1,
        content_hash CHAR(64),
        created_by UUID REFERENCES admin_users(id),
        published_by UUID REFERENCES admin_users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at TIMESTAMPTZ
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_chatbot_one_published
      ON chatbot_rule_versions ((status))
      WHERE status = 'published';
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chatbot_versions_timeline
      ON chatbot_rule_versions(version_number DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chatbot_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        version_id UUID NOT NULL REFERENCES chatbot_rule_versions(id) ON DELETE CASCADE,
        trigger_type VARCHAR(20) NOT NULL,
        trigger_values JSONB NOT NULL DEFAULT '[]'::jsonb,
        response_text TEXT NOT NULL,
        priority INTEGER NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        action VARCHAR(30) NOT NULL DEFAULT 'reply',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (version_id, priority)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS safety_control_state (
        singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
        manual_paused BOOLEAN NOT NULL DEFAULT FALSE,
        reason TEXT,
        changed_by UUID REFERENCES admin_users(id),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      INSERT INTO safety_control_state (singleton, manual_paused)
      VALUES (TRUE, FALSE)
      ON CONFLICT (singleton) DO NOTHING;
    `);

    const seededVersion = await client.query<{ id: string }>(
      `
        INSERT INTO chatbot_rule_versions (
          version_number,
          name,
          status,
          change_summary,
          published_at
        )
        VALUES (
          1,
          'Initial migrated rules',
          'published',
          'Migrated hardcoded chatbot responses; menu 3/4 aligned to their labels.',
          NOW()
        )
        ON CONFLICT (version_number) DO NOTHING
        RETURNING id::text;
      `
    );
    const versionOne =
      seededVersion.rows[0] ??
      (
        await client.query<{ id: string }>(
          `
            SELECT id::text
            FROM chatbot_rule_versions
            WHERE version_number = 1
            LIMIT 1;
          `
        )
      ).rows[0];
    const ruleCount = await client.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM chatbot_rules
        WHERE version_id = $1::uuid;
      `,
      [versionOne.id]
    );
    if (Number(ruleCount.rows[0].count) === 0) {
      const normalizedSeed = validateChatbotRules(initialChatbotRules);
      for (const rule of normalizedSeed) {
        await client.query(
          `
            INSERT INTO chatbot_rules (
              version_id,
              trigger_type,
              trigger_values,
              response_text,
              priority,
              enabled,
              action
            )
            VALUES ($1::uuid, $2, $3::jsonb, $4, $5, $6, $7);
          `,
          [
            versionOne.id,
            rule.triggerType,
            JSON.stringify(rule.triggerValues),
            rule.responseText,
            rule.priority,
            rule.enabled,
            rule.action
          ]
        );
      }
      const contentHash = createHash('sha256')
        .update(JSON.stringify(normalizedSeed))
        .digest('hex');
      await client.query(
        `
          UPDATE chatbot_rule_versions
          SET content_hash = $2, updated_at = NOW()
          WHERE id = $1::uuid;
        `,
        [versionOne.id, contentHash]
      );
    }

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
