import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../database/connection.js';
import { AppError } from '../middleware/error.middleware.js';
import {
  matchChatbotRule,
  validateChatbotRules,
  type ChatbotRuleDefinition,
  type ChatbotTriggerType,
  type StoredChatbotRule
} from './chatbot-rules.js';

type VersionStatus = 'draft' | 'published' | 'archived';

type VersionRow = {
  id: string;
  version_number: number;
  name: string;
  status: VersionStatus;
  change_summary: string | null;
  based_on_version_id: string | null;
  revision: number;
  content_hash: string | null;
  created_by: string | null;
  published_by: string | null;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
  rule_count?: string;
};

type RuleRow = {
  id: string;
  trigger_type: ChatbotTriggerType;
  trigger_values: string[];
  response_text: string;
  priority: number;
  enabled: boolean;
  action: 'reply' | 'create_handoff';
};

type ActiveCache = {
  version: ReturnType<typeof versionFromRow>;
  rules: StoredChatbotRule[];
  expiresAt: number;
};

const versionFromRow = (row: VersionRow) => ({
  id: row.id,
  versionNumber: row.version_number,
  name: row.name,
  status: row.status,
  changeSummary: row.change_summary,
  basedOnVersionId: row.based_on_version_id,
  revision: row.revision,
  contentHash: row.content_hash,
  createdBy: row.created_by,
  publishedBy: row.published_by,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  publishedAt: row.published_at?.toISOString() ?? null,
  ruleCount: Number(row.rule_count ?? 0)
});

const ruleFromRow = (row: RuleRow): StoredChatbotRule => ({
  id: row.id,
  triggerType: row.trigger_type,
  triggerValues: row.trigger_values,
  responseText: row.response_text,
  priority: row.priority,
  enabled: row.enabled,
  action: row.action
});

const contentHash = (rules: ChatbotRuleDefinition[]): string =>
  createHash('sha256')
    .update(
      JSON.stringify(
        rules
          .map((rule) => ({
            triggerType: rule.triggerType,
            triggerValues: rule.triggerValues,
            responseText: rule.responseText,
            priority: rule.priority,
            enabled: rule.enabled,
            action: rule.action
          }))
          .sort((left, right) => left.priority - right.priority)
      )
    )
    .digest('hex');

export class ChatbotService {
  private activeCache: ActiveCache | null = null;
  private readonly cacheTtlMs = 5_000;

  async warmCache(): Promise<void> {
    await this.getActiveVersion(true);
  }

  invalidateCache(): void {
    this.activeCache = null;
  }

  async getReply(input: string | undefined | null): Promise<string> {
    return (await this.evaluate(input)).response;
  }

  async evaluate(input: string | undefined | null, versionId?: string) {
    const selected = versionId
      ? await this.getVersionWithRules(versionId)
      : await this.getActiveVersion();
    if (!selected) {
      throw new AppError(
        'Chatbot version was not found',
        404,
        'CHATBOT_VERSION_NOT_FOUND'
      );
    }
    const match = matchChatbotRule(selected.rules, input);
    return {
      versionId: selected.version.id,
      versionNumber: selected.version.versionNumber,
      normalizedInput: match.normalizedInput,
      matchedRule: {
        id: match.rule.id,
        triggerType: match.rule.triggerType,
        priority: match.rule.priority,
        matchedTrigger: match.matchedTrigger,
        action: match.rule.action
      },
      response: match.rule.responseText
    };
  }

  async listVersions() {
    const result = await pool.query<VersionRow>(
      `
        SELECT
          versions.id::text,
          versions.version_number,
          versions.name,
          versions.status,
          versions.change_summary,
          versions.based_on_version_id::text,
          versions.revision,
          versions.content_hash,
          versions.created_by::text,
          versions.published_by::text,
          versions.created_at,
          versions.updated_at,
          versions.published_at,
          COUNT(rules.id)::text AS rule_count
        FROM chatbot_rule_versions versions
        LEFT JOIN chatbot_rules rules ON rules.version_id = versions.id
        GROUP BY versions.id
        ORDER BY versions.version_number DESC;
      `
    );
    return result.rows.map(versionFromRow);
  }

  async getVersion(versionId: string) {
    return this.getVersionWithRules(versionId);
  }

  async createDraft(actorUserId: string, name?: string) {
    const client = await pool.connect();
    let draftId: string;
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('chatbot_rule_versions'));`
      );
      const active = await this.selectPublished(client, true);
      if (!active) {
        throw new AppError(
          'Published chatbot version was not found',
          409,
          'CHATBOT_ACTIVE_VERSION_MISSING'
        );
      }
      const next = await client.query<{ version_number: number }>(
        `
          SELECT COALESCE(MAX(version_number), 0) + 1 AS version_number
          FROM chatbot_rule_versions;
        `
      );
      const versionNumber = Number(next.rows[0].version_number);
      const inserted = await client.query<{ id: string }>(
        `
          INSERT INTO chatbot_rule_versions (
            version_number,
            name,
            status,
            based_on_version_id,
            created_by,
            content_hash
          )
          VALUES ($1, $2, 'draft', $3::uuid, $4::uuid, $5)
          RETURNING id::text;
        `,
        [
          versionNumber,
          name?.trim().slice(0, 150) || `Draft v${versionNumber}`,
          active.id,
          actorUserId,
          active.content_hash
        ]
      );
      draftId = inserted.rows[0].id;
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
          SELECT
            $1::uuid,
            trigger_type,
            trigger_values,
            response_text,
            priority,
            enabled,
            action
          FROM chatbot_rules
          WHERE version_id = $2::uuid
          ORDER BY priority;
        `,
        [draftId, active.id]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.getVersionWithRules(draftId);
  }

  async replaceDraftRules(input: {
    versionId: string;
    expectedRevision: number;
    rules: ChatbotRuleDefinition[];
  }) {
    const rules = validateChatbotRules(input.rules);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const version = await client.query<VersionRow>(
        `
          SELECT
            id::text,
            version_number,
            name,
            status,
            change_summary,
            based_on_version_id::text,
            revision,
            content_hash,
            created_by::text,
            published_by::text,
            created_at,
            updated_at,
            published_at
          FROM chatbot_rule_versions
          WHERE id = $1::uuid
          FOR UPDATE;
        `,
        [input.versionId]
      );
      const current = version.rows[0];
      if (!current) {
        throw new AppError(
          'Chatbot version was not found',
          404,
          'CHATBOT_VERSION_NOT_FOUND'
        );
      }
      if (current.status !== 'draft') {
        throw new AppError(
          'Published chatbot versions are immutable',
          409,
          'CHATBOT_VERSION_IMMUTABLE'
        );
      }
      if (current.revision !== input.expectedRevision) {
        throw new AppError(
          'Draft was updated by another Admin',
          409,
          'CHATBOT_DRAFT_CONFLICT',
          { currentRevision: current.revision }
        );
      }
      await client.query(
        'DELETE FROM chatbot_rules WHERE version_id = $1::uuid;',
        [input.versionId]
      );
      for (const rule of rules) {
        await this.insertRule(client, input.versionId, rule);
      }
      await client.query(
        `
          UPDATE chatbot_rule_versions
          SET
            revision = revision + 1,
            content_hash = $2,
            updated_at = NOW()
          WHERE id = $1::uuid;
        `,
        [input.versionId, contentHash(rules)]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.getVersionWithRules(input.versionId);
  }

  async publish(input: {
    versionId: string;
    actorUserId: string;
    expectedActiveVersionId: string;
    changeSummary: string;
  }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('chatbot_rule_versions'));`
      );
      const active = await this.selectPublished(client, true);
      if (!active || active.id !== input.expectedActiveVersionId) {
        throw new AppError(
          'Active chatbot version changed before publish',
          409,
          'CHATBOT_PUBLISH_CONFLICT',
          { activeVersionId: active?.id ?? null }
        );
      }
      const target = await this.selectVersion(client, input.versionId, true);
      if (!target) {
        throw new AppError(
          'Chatbot version was not found',
          404,
          'CHATBOT_VERSION_NOT_FOUND'
        );
      }
      if (target.status !== 'draft') {
        throw new AppError(
          'Only a draft can be published',
          409,
          'CHATBOT_VERSION_IMMUTABLE'
        );
      }
      const rules = await this.selectRules(client, target.id);
      validateChatbotRules(rules);
      await client.query(
        `
          UPDATE chatbot_rule_versions
          SET status = 'archived', updated_at = NOW()
          WHERE id = $1::uuid;
        `,
        [active.id]
      );
      await client.query(
        `
          UPDATE chatbot_rule_versions
          SET
            status = 'published',
            change_summary = $2,
            published_by = $3::uuid,
            published_at = NOW(),
            updated_at = NOW()
          WHERE id = $1::uuid;
        `,
        [target.id, input.changeSummary, input.actorUserId]
      );
      await client.query('COMMIT');
      this.invalidateCache();
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.getVersionWithRules(input.versionId);
  }

  async rollback(input: {
    targetVersionId: string;
    actorUserId: string;
    expectedActiveVersionId: string;
  }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('chatbot_rule_versions'));`
      );
      const active = await this.selectPublished(client, true);
      if (!active || active.id !== input.expectedActiveVersionId) {
        throw new AppError(
          'Active chatbot version changed before rollback',
          409,
          'CHATBOT_PUBLISH_CONFLICT',
          { activeVersionId: active?.id ?? null }
        );
      }
      const target = await this.selectVersion(
        client,
        input.targetVersionId,
        true
      );
      if (!target) {
        throw new AppError(
          'Rollback target was not found',
          404,
          'CHATBOT_VERSION_NOT_FOUND'
        );
      }
      if (target.status !== 'archived' || !target.published_at) {
        throw new AppError(
          'Rollback target must be a previously published version',
          409,
          'CHATBOT_ROLLBACK_NOT_ALLOWED'
        );
      }
      await client.query(
        `
          UPDATE chatbot_rule_versions
          SET status = 'archived', updated_at = NOW()
          WHERE id = $1::uuid;
        `,
        [active.id]
      );
      await client.query(
        `
          UPDATE chatbot_rule_versions
          SET
            status = 'published',
            updated_at = NOW()
          WHERE id = $1::uuid;
        `,
        [target.id]
      );
      await client.query('COMMIT');
      this.invalidateCache();
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.getVersionWithRules(input.targetVersionId);
  }

  private async getActiveVersion(force = false) {
    if (
      !force &&
      this.activeCache &&
      this.activeCache.expiresAt > Date.now()
    ) {
      return {
        version: this.activeCache.version,
        rules: this.activeCache.rules
      };
    }
    try {
      const active = await this.selectPublished(pool, false);
      if (!active) {
        throw new AppError(
          'Published chatbot version was not found',
          503,
          'CHATBOT_ACTIVE_VERSION_MISSING'
        );
      }
      const rules = await this.selectRules(pool, active.id);
      const normalized = validateChatbotRules(rules).map((rule, index) => ({
        ...rule,
        id: rules[index].id
      }));
      const version = versionFromRow(active);
      this.activeCache = {
        version,
        rules: normalized,
        expiresAt: Date.now() + this.cacheTtlMs
      };
      return { version, rules: normalized };
    } catch (error) {
      if (this.activeCache) {
        return {
          version: this.activeCache.version,
          rules: this.activeCache.rules
        };
      }
      throw error;
    }
  }

  private async getVersionWithRules(versionId: string) {
    const version = await this.selectVersion(pool, versionId, false);
    if (!version) return null;
    const rules = await this.selectRules(pool, versionId);
    return {
      version: { ...versionFromRow(version), ruleCount: rules.length },
      rules
    };
  }

  private async selectPublished(
    database: Pick<PoolClient, 'query'>,
    forUpdate: boolean
  ): Promise<VersionRow | null> {
    const result = await database.query<VersionRow>(
      `
        SELECT
          id::text,
          version_number,
          name,
          status,
          change_summary,
          based_on_version_id::text,
          revision,
          content_hash,
          created_by::text,
          published_by::text,
          created_at,
          updated_at,
          published_at
        FROM chatbot_rule_versions
        WHERE status = 'published'
        LIMIT 1
        ${forUpdate ? 'FOR UPDATE' : ''};
      `
    );
    return result.rows[0] ?? null;
  }

  private async selectVersion(
    database: Pick<PoolClient, 'query'>,
    versionId: string,
    forUpdate: boolean
  ): Promise<VersionRow | null> {
    const result = await database.query<VersionRow>(
      `
        SELECT
          id::text,
          version_number,
          name,
          status,
          change_summary,
          based_on_version_id::text,
          revision,
          content_hash,
          created_by::text,
          published_by::text,
          created_at,
          updated_at,
          published_at
        FROM chatbot_rule_versions
        WHERE id = $1::uuid
        LIMIT 1
        ${forUpdate ? 'FOR UPDATE' : ''};
      `,
      [versionId]
    );
    return result.rows[0] ?? null;
  }

  private async selectRules(
    database: Pick<PoolClient, 'query'>,
    versionId: string
  ): Promise<StoredChatbotRule[]> {
    const result = await database.query<RuleRow>(
      `
        SELECT
          id::text,
          trigger_type,
          trigger_values,
          response_text,
          priority,
          enabled,
          action
        FROM chatbot_rules
        WHERE version_id = $1::uuid
        ORDER BY priority ASC;
      `,
      [versionId]
    );
    return result.rows.map(ruleFromRow);
  }

  private async insertRule(
    client: PoolClient,
    versionId: string,
    rule: ChatbotRuleDefinition
  ): Promise<void> {
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
        versionId,
        rule.triggerType,
        JSON.stringify(rule.triggerValues),
        rule.responseText,
        rule.priority,
        rule.enabled,
        rule.action
      ]
    );
  }
}
