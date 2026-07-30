import type { QueryResult, QueryResultRow } from 'pg';
import { ReadModelService } from '../src/services/read-model.service.js';
import type { QueryExecutor } from '../src/services/message.service.js';
import { decodeCursor, escapeLikePattern } from '../src/utils/cursor.js';

const queryResult = <Row extends QueryResultRow>(
  rows: Row[]
): QueryResult<Row> => ({
  command: 'SELECT',
  rowCount: rows.length,
  oid: 0,
  fields: [],
  rows
});

describe('ReadModelService', () => {
  it('escapes SQL wildcard characters and produces a stable next cursor', async () => {
    const rows = [1, 2, 3].map((id) => ({
      id: String(id),
      display_name: `Contact ${id}`,
      phone_number: `62812345678${id}`,
      identity_status: 'resolved' as const,
      last_message_id: String(id * 10),
      last_message_at: new Date(`2026-07-30T03:0${4 - id}:00.000Z`),
      last_message_type: 'text',
      last_message_content: `Message ${id}`,
      last_message_direction: 'incoming' as const,
      last_outgoing_status: null,
      incoming_count: '1',
      outgoing_count: '0'
    }));
    const database = {
      query: vi.fn(async () => queryResult(rows))
    } as unknown as QueryExecutor;
    const service = new ReadModelService(database);

    const result = await service.listConversations({
      query: 'Raho%_\\',
      limit: 2
    });

    expect(result.data).toHaveLength(2);
    expect(result.data[0].maskedPhone).toBe('6281***781');
    expect(result.nextCursor).not.toBeNull();
    expect(decodeCursor(result.nextCursor!)).toEqual({
      occurredAt: rows[1].last_message_at.toISOString(),
      id: '2'
    });
    expect(vi.mocked(database.query).mock.calls[0][1]?.[0]).toBe(
      'Raho\\%\\_\\\\'
    );
  });

  it('returns unsupported message content as a typed placeholder, not empty text', async () => {
    const database = {
      query: vi.fn(async () =>
        queryResult([
          {
            id: '9',
            display_name: null,
            phone_number: '6281234567890',
            identity_status: 'unresolved' as const,
            last_message_id: '91',
            last_message_at: new Date('2026-07-30T03:00:00.000Z'),
            last_message_type: 'image',
            last_message_content: null,
            last_message_direction: 'incoming' as const,
            last_outgoing_status: null,
            incoming_count: '1',
            outgoing_count: '0'
          }
        ])
      )
    } as unknown as QueryExecutor;
    const service = new ReadModelService(database);

    const result = await service.listConversations({});

    expect(result.data[0].lastMessage.preview).toBe('[Unsupported: image]');
    expect(result.data[0].identityStatus).toBe('unresolved');
  });

  it('escapes all characters with SQL LIKE meaning', () => {
    expect(escapeLikePattern('100%_\\safe')).toBe('100\\%\\_\\\\safe');
  });
});
