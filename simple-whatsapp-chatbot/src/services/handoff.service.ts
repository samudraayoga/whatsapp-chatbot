import { pool } from '../database/connection.js';
import { maskPhoneNumber } from '../utils/phone.js';
import { decodeCursor, encodeCursor } from '../utils/cursor.js';
import type { QueryExecutor } from './message.service.js';
import type { Page } from './read-model.service.js';

export type HandoffState =
  | 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed' | 'canceled';

export type Handoff = {
  id: string;
  contactId: string;
  sourceMessageId: string;
  state: HandoffState;
  assigneeUserId: string | null;
  dueAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  tenantId: string | null;
  aiConversationId: string | null;
  aiMessageTraceId: string | null;
  reason: string | null;
  priority: 'normal' | 'high';
  summary: string | null;
  knowledgeIds: string[];
  safetyCategory: string | null;
  traceId: string | null;
  createdAt: string;
  updatedAt: string;
  contact: {
    displayName: string | null;
    maskedPhone: string | null;
  };
  sourcePreview: string;
};

type HandoffRow = {
  id: string;
  contact_id: string;
  source_message_id: string;
  state: HandoffState;
  assignee_user_id: string | null;
  due_at: Date | null;
  resolved_at: Date | null;
  resolution_note: string | null;
  created_at: Date;
  updated_at: Date;
  display_name: string | null;
  phone_number: string | null;
  source_content: string | null;
  tenant_id: string | null;
  ai_conversation_id: string | null;
  ai_message_trace_id: string | null;
  reason: string | null;
  priority: 'normal' | 'high';
  summary: string | null;
  knowledge_ids: unknown;
  safety_category: string | null;
  trace_id: string | null;
};

const fromRow = (row: HandoffRow): Handoff => ({
  id: row.id,
  contactId: row.contact_id,
  sourceMessageId: row.source_message_id,
  state: row.state,
  assigneeUserId: row.assignee_user_id,
  dueAt: row.due_at?.toISOString() ?? null,
  resolvedAt: row.resolved_at?.toISOString() ?? null,
  resolutionNote: row.resolution_note,
  tenantId: row.tenant_id,
  aiConversationId: row.ai_conversation_id,
  aiMessageTraceId: row.ai_message_trace_id,
  reason: row.reason,
  priority: row.priority,
  summary: row.summary,
  knowledgeIds: Array.isArray(row.knowledge_ids)
    ? row.knowledge_ids.filter((value): value is string => typeof value === 'string') : [],
  safetyCategory: row.safety_category,
  traceId: row.trace_id,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  contact: {
    displayName: row.display_name,
    maskedPhone: row.phone_number
      ? maskPhoneNumber(row.phone_number)
      : null
  },
  sourcePreview: (row.source_content ?? '').slice(0, 120)
});

const selectColumns = `
  handoffs.id::text,
  handoffs.contact_id::text,
  handoffs.source_message_id::text,
  handoffs.state,
  handoffs.assignee_user_id::text,
  handoffs.due_at,
  handoffs.resolved_at,
  handoffs.resolution_note,
  handoffs.tenant_id::text,
  handoffs.ai_conversation_id::text,
  handoffs.ai_message_trace_id::text,
  handoffs.reason,
  handoffs.priority,
  handoffs.summary,
  handoffs.knowledge_ids,
  handoffs.safety_category,
  handoffs.trace_id,
  handoffs.created_at,
  handoffs.updated_at,
  contacts.display_name,
  contacts.phone_number,
  source.content AS source_content
`;

export class HandoffService {
  constructor(private readonly database: QueryExecutor = pool) {}

  async getSummary(): Promise<{
    open: number;
    unassigned: number;
    overdue: number;
  }> {
    const result = await this.database.query<{
      open: string;
      unassigned: string;
      overdue: string;
    }>(
      `
        SELECT
          COUNT(*) FILTER (WHERE state IN ('open', 'assigned', 'in_progress'))::text AS open,
          COUNT(*) FILTER (
            WHERE state = 'open' AND assignee_user_id IS NULL
          )::text AS unassigned,
          COUNT(*) FILTER (
            WHERE state IN ('open', 'assigned', 'in_progress')
              AND due_at IS NOT NULL
              AND due_at < NOW()
          )::text AS overdue
        FROM handoff_tasks;
      `
    );
    const row = result.rows[0];
    return {
      open: Number(row.open),
      unassigned: Number(row.unassigned),
      overdue: Number(row.overdue)
    };
  }

  async list(input: {
    state?: HandoffState | 'all';
    cursor?: string;
    limit?: number;
    tenantId?: string;
  }): Promise<Page<Handoff>> {
    const limit = Math.max(1, Math.min(input.limit ?? 30, 100));
    const cursor = decodeCursor(input.cursor);
    const result = await this.database.query<HandoffRow>(
      `
        SELECT ${selectColumns}
        FROM handoff_tasks handoffs
        INNER JOIN contacts ON contacts.id = handoffs.contact_id
        INNER JOIN messages source ON source.id = handoffs.source_message_id
        WHERE ($1::text = 'all' OR handoffs.state = $1)
          AND ($5::uuid IS NULL OR handoffs.tenant_id = $5::uuid)
          AND (
            $2::timestamptz IS NULL
            OR handoffs.created_at < $2
            OR (
              handoffs.created_at = $2
              AND handoffs.source_message_id < $3::bigint
            )
          )
        ORDER BY handoffs.created_at DESC, handoffs.source_message_id DESC
        LIMIT $4;
      `,
      [
        input.state ?? 'open',
        cursor?.occurredAt ?? null,
        cursor?.id ?? null,
        limit + 1,
        input.tenantId ?? null
      ]
    );
    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);
    return {
      data: rows.map(fromRow),
      nextCursor:
        hasMore && last
          ? encodeCursor({
              occurredAt: last.created_at.toISOString(),
              id: last.source_message_id
            })
          : null
    };
  }

  async get(id: string, tenantId?: string): Promise<Handoff | null> {
    const result = await this.database.query<HandoffRow>(
      `
        SELECT ${selectColumns}
        FROM handoff_tasks handoffs
        INNER JOIN contacts ON contacts.id = handoffs.contact_id
        INNER JOIN messages source ON source.id = handoffs.source_message_id
        WHERE handoffs.id = $1::uuid
          AND ($2::uuid IS NULL OR handoffs.tenant_id = $2::uuid)
        LIMIT 1;
      `,
      [id, tenantId ?? null]
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async assign(id: string, assigneeUserId: string, tenantId?: string): Promise<Handoff | null> {
    const result = await this.database.query<HandoffRow>(
      `
        WITH updated AS (
          UPDATE handoff_tasks
          SET
            state = 'assigned',
            assignee_user_id = $2::uuid,
            updated_at = NOW()
          WHERE id = $1::uuid
            AND state = 'open'
            AND ($3::uuid IS NULL OR tenant_id = $3::uuid)
          RETURNING *
        )
        SELECT
          ${selectColumns.replaceAll('handoffs.', 'updated.')}
        FROM updated
        INNER JOIN contacts ON contacts.id = updated.contact_id
        INNER JOIN messages source ON source.id = updated.source_message_id;
      `,
      [id, assigneeUserId, tenantId ?? null]
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async resolve(id: string, resolutionNote: string, tenantId?: string): Promise<Handoff | null> {
    const result = await this.database.query<HandoffRow>(
      `
        WITH updated AS (
          UPDATE handoff_tasks
          SET
            state = 'resolved',
            resolved_at = NOW(),
            resolution_note = $2,
            updated_at = NOW()
          WHERE id = $1::uuid
            AND state IN ('open', 'assigned', 'in_progress')
            AND ($3::uuid IS NULL OR tenant_id = $3::uuid)
          RETURNING *
        )
        SELECT
          ${selectColumns.replaceAll('handoffs.', 'updated.')}
        FROM updated
        INNER JOIN contacts ON contacts.id = updated.contact_id
        INNER JOIN messages source ON source.id = updated.source_message_id;
      `,
      [id, resolutionNote, tenantId ?? null]
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async markInProgress(id: string, assigneeUserId: string, tenantId?: string): Promise<Handoff | null> {
    const result = await this.database.query<HandoffRow>(
      `WITH updated AS (
         UPDATE handoff_tasks SET state = 'in_progress', assignee_user_id = $2::uuid,
           updated_at = NOW()
         WHERE id = $1::uuid AND state IN ('open', 'assigned')
           AND ($3::uuid IS NULL OR tenant_id = $3::uuid) RETURNING *
       )
       SELECT ${selectColumns.replaceAll('handoffs.', 'updated.')}
       FROM updated
       INNER JOIN contacts ON contacts.id = updated.contact_id
       INNER JOIN messages source ON source.id = updated.source_message_id;`,
      [id, assigneeUserId, tenantId ?? null]
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async close(id: string, resolutionNote: string, tenantId?: string): Promise<Handoff | null> {
    const result = await this.database.query<HandoffRow>(
      `WITH updated AS (
         UPDATE handoff_tasks SET state = 'closed', resolved_at = COALESCE(resolved_at, NOW()),
           resolution_note = $2, updated_at = NOW()
         WHERE id = $1::uuid AND state IN ('open', 'assigned', 'in_progress', 'resolved')
           AND ($3::uuid IS NULL OR tenant_id = $3::uuid)
         RETURNING *
       )
       SELECT ${selectColumns.replaceAll('handoffs.', 'updated.')}
       FROM updated
       INNER JOIN contacts ON contacts.id = updated.contact_id
       INNER JOIN messages source ON source.id = updated.source_message_id;`,
      [id, resolutionNote, tenantId ?? null]
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }
}
