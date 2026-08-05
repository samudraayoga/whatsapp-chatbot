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

type ActiveConfigRow = {
  id: string;
  revision: number;
  content_hash: string | null;
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

type ActiveConfigRuleRow = {
  id: string;
  revision: number;
  updated_at: Date;
  rule_id: string | null;
  trigger_type: ChatbotTriggerType | null;
  trigger_values: string[] | null;
  response_text: string | null;
  priority: number | null;
  enabled: boolean | null;
  action: 'reply' | 'create_handoff' | null;
};

type ActiveSnapshot = {
  versionId: string;
  revision: number;
  updatedAt: string;
  rules: StoredChatbotRule[];
};

type ActiveCache = ActiveSnapshot & { expiresAt: number };

export type ChatbotConfig = {
  revision: number;
  updatedAt: string;
  rules: StoredChatbotRule[];
};

export type ChatbotConfigUpdateResult = {
  config: ChatbotConfig;
  audit: {
    resourceId: string;
    before: { revision: number; contentHash: string | null; ruleCount: number };
    after: { revision: number; contentHash: string; ruleCount: number };
  };
};

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

const publicConfig = (snapshot: ActiveSnapshot): ChatbotConfig => ({
  revision: snapshot.revision,
  updatedAt: snapshot.updatedAt,
  rules: snapshot.rules
});

export class ChatbotService {
  private activeCache: ActiveCache | null = null;
  private cacheGeneration = 0;
  private readonly cacheTtlMs = 5_000;

  async warmCache(): Promise<void> {
    await this.getActiveSnapshot(true);
  }

  invalidateCache(): void {
    this.activeCache = null;
    this.cacheGeneration += 1;
  }

  async getConfig(): Promise<ChatbotConfig> {
    const generation = this.cacheGeneration;
    const snapshot = await this.loadActiveSnapshot();
    this.cacheSnapshot(snapshot, generation);
    return publicConfig(snapshot);
  }

  async updateConfig(input: {
    expectedRevision: number;
    rules: ChatbotRuleDefinition[];
  }): Promise<ChatbotConfigUpdateResult> {
    const rules = validateChatbotRules(input.rules).sort(
      (left, right) => left.priority - right.priority
    );
    const nextHash = contentHash(rules);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const current = await this.lockActiveConfig(client);
      if (!current) {
        throw new AppError(
          'Active chatbot configuration was not found',
          503,
          'CHATBOT_ACTIVE_CONFIG_MISSING'
        );
      }
      if (current.revision !== input.expectedRevision) {
        throw new AppError(
          'Chatbot configuration was updated by another Admin',
          409,
          'CHATBOT_CONFIG_CONFLICT',
          { currentRevision: current.revision }
        );
      }

      const countResult = await client.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM chatbot_rules
          WHERE version_id = $1::uuid;
        `,
        [current.id]
      );
      await client.query(
        'DELETE FROM chatbot_rules WHERE version_id = $1::uuid;',
        [current.id]
      );

      const insertedRules: StoredChatbotRule[] = [];
      for (const rule of rules) {
        insertedRules.push(await this.insertRule(client, current.id, rule));
      }

      const updated = await client.query<{
        revision: number;
        updated_at: Date;
      }>(
        `
          UPDATE chatbot_rule_versions
          SET
            revision = revision + 1,
            content_hash = $2,
            updated_at = NOW()
          WHERE id = $1::uuid
          RETURNING revision, updated_at;
        `,
        [current.id, nextHash]
      );
      const updatedConfig = updated.rows[0];
      const config: ChatbotConfig = {
        revision: updatedConfig.revision,
        updatedAt: updatedConfig.updated_at.toISOString(),
        rules: insertedRules
      };

      await client.query('COMMIT');
      this.invalidateCache();
      this.cacheSnapshot({
        versionId: current.id,
        revision: config.revision,
        updatedAt: config.updatedAt,
        rules: config.rules
      });

      return {
        config,
        audit: {
          resourceId: current.id,
          before: {
            revision: current.revision,
            contentHash: current.content_hash,
            ruleCount: Number(countResult.rows[0].count)
          },
          after: {
            revision: config.revision,
            contentHash: nextHash,
            ruleCount: config.rules.length
          }
        }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  preview(input: string | undefined | null, rules: ChatbotRuleDefinition[]) {
    const normalized = validateChatbotRules(rules);
    const candidates: StoredChatbotRule[] = normalized.map((rule, index) => ({
      ...rule,
      id: String(index)
    }));
    const match = matchChatbotRule(candidates, input);
    const originalId = normalized[Number(match.rule.id)].id;

    return {
      normalizedInput: match.normalizedInput,
      matchedRule: {
        ...(originalId ? { id: originalId } : {}),
        triggerType: match.rule.triggerType,
        priority: match.rule.priority,
        matchedTrigger: match.matchedTrigger,
        action: match.rule.action
      },
      response: match.rule.responseText
    };
  }

  async evaluate(input: string | undefined | null) {
    const selected = await this.getActiveSnapshot();
    const match = matchChatbotRule(selected.rules, input);
    return {
      versionId: selected.versionId,
      revision: selected.revision,
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

  private async getActiveSnapshot(force = false): Promise<ActiveSnapshot> {
    if (!force && this.activeCache && this.activeCache.expiresAt > Date.now()) {
      return this.activeCache;
    }

    try {
      const generation = this.cacheGeneration;
      const snapshot = await this.loadActiveSnapshot();
      this.cacheSnapshot(snapshot, generation);
      return snapshot;
    } catch (error) {
      if (this.activeCache) return this.activeCache;
      throw error;
    }
  }

  private cacheSnapshot(
    snapshot: ActiveSnapshot,
    generation: number = this.cacheGeneration
  ): void {
    if (generation !== this.cacheGeneration) return;
    this.activeCache = {
      ...snapshot,
      expiresAt: Date.now() + this.cacheTtlMs
    };
  }

  private async loadActiveSnapshot(): Promise<ActiveSnapshot> {
    const result = await pool.query<ActiveConfigRuleRow>(
      `
        SELECT
          active_config.id::text,
          active_config.revision,
          active_config.updated_at,
          rules.id::text AS rule_id,
          rules.trigger_type,
          rules.trigger_values,
          rules.response_text,
          rules.priority,
          rules.enabled,
          rules.action
        FROM chatbot_rule_versions AS active_config
        LEFT JOIN chatbot_rules rules ON rules.version_id = active_config.id
        WHERE active_config.status = 'published'
        ORDER BY rules.priority ASC;
      `
    );
    const first = result.rows[0];
    if (!first) {
      throw new AppError(
        'Active chatbot configuration was not found',
        503,
        'CHATBOT_ACTIVE_CONFIG_MISSING'
      );
    }

    const storedRules = result.rows.flatMap((row) => {
      if (
        row.rule_id === null ||
        row.trigger_type === null ||
        row.trigger_values === null ||
        row.response_text === null ||
        row.priority === null ||
        row.enabled === null ||
        row.action === null
      ) {
        return [];
      }
      return [
        ruleFromRow({
          id: row.rule_id,
          trigger_type: row.trigger_type,
          trigger_values: row.trigger_values,
          response_text: row.response_text,
          priority: row.priority,
          enabled: row.enabled,
          action: row.action
        })
      ];
    });
    const normalizedRules = validateChatbotRules(storedRules).map(
      (rule, index) => ({ ...rule, id: storedRules[index].id })
    );

    return {
      versionId: first.id,
      revision: first.revision,
      updatedAt: first.updated_at.toISOString(),
      rules: normalizedRules
    };
  }

  private async lockActiveConfig(
    client: Pick<PoolClient, 'query'>
  ): Promise<ActiveConfigRow | null> {
    const result = await client.query<ActiveConfigRow>(
      `
        SELECT
          id::text,
          revision,
          content_hash
        FROM chatbot_rule_versions
        WHERE status = 'published'
        LIMIT 1
        FOR UPDATE;
      `
    );
    return result.rows[0] ?? null;
  }

  private async insertRule(
    client: PoolClient,
    activeConfigId: string,
    rule: ChatbotRuleDefinition
  ): Promise<StoredChatbotRule> {
    const result = await client.query<RuleRow>(
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
        VALUES ($1::uuid, $2, $3::jsonb, $4, $5, $6, $7)
        RETURNING
          id::text,
          trigger_type,
          trigger_values,
          response_text,
          priority,
          enabled,
          action;
      `,
      [
        activeConfigId,
        rule.triggerType,
        JSON.stringify(rule.triggerValues),
        rule.responseText,
        rule.priority,
        rule.enabled,
        rule.action
      ]
    );
    return ruleFromRow(result.rows[0]);
  }
}
