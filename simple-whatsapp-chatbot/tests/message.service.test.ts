import type { QueryResult, QueryResultRow } from 'pg';
import {
  MessageService,
  type QueryExecutor
} from '../src/services/message.service.js';

const queryResult = <Row extends QueryResultRow>(
  rows: Row[],
  rowCount: number
): QueryResult<Row> => ({
  command: 'INSERT',
  rowCount,
  oid: 0,
  fields: [],
  rows
});

describe('MessageService deduplication characterization', () => {
  it('reports an incoming provider message as duplicate when insert returns no row', async () => {
    const database: QueryExecutor = {
      query: vi
        .fn()
        .mockResolvedValueOnce(
          queryResult([{ id: '1', phone_number: '6281234567890' }], 1)
        )
        .mockResolvedValueOnce(queryResult([], 0))
    } as unknown as QueryExecutor;
    const service = new MessageService(database);

    const result = await service.saveMessage({
      whatsappMessageId: 'provider-message-1',
      whatsappJid: '6281234567890@s.whatsapp.net',
      direction: 'incoming',
      content: 'Halo'
    });

    expect(result).toEqual({ inserted: false });
    expect(database.query).toHaveBeenCalledTimes(2);
  });

  it('reports a new provider message as inserted', async () => {
    const database: QueryExecutor = {
      query: vi
        .fn()
        .mockResolvedValueOnce(
          queryResult([{ id: '1', phone_number: '6281234567890' }], 1)
        )
        .mockResolvedValueOnce(queryResult([{ id: '99' }], 1))
    } as unknown as QueryExecutor;
    const service = new MessageService(database);

    await expect(
      service.saveMessage({
        whatsappMessageId: 'provider-message-2',
        whatsappJid: '6281234567890@s.whatsapp.net',
        direction: 'incoming',
        content: 'Menu'
      })
    ).resolves.toEqual({ inserted: true });
  });

  it('creates exactly one follow-up task for an incoming menu 5 message', async () => {
    const database: QueryExecutor = {
      query: vi
        .fn()
        .mockResolvedValueOnce(
          queryResult([{ id: '1', phone_number: '6281234567890' }], 1)
        )
        .mockResolvedValueOnce(queryResult([{ id: '99' }], 1))
        .mockResolvedValueOnce(queryResult([], 1))
    } as unknown as QueryExecutor;
    const service = new MessageService(database);

    await expect(
      service.saveMessage({
        whatsappMessageId: 'provider-menu-5',
        whatsappJid: '6281234567890@s.whatsapp.net',
        direction: 'incoming',
        content: '5'
      })
    ).resolves.toEqual({ inserted: true });

    const handoffCall = vi.mocked(database.query).mock.calls[2];
    expect(handoffCall[0]).toContain('INSERT INTO handoff_tasks');
    expect(handoffCall[0]).toContain('ON CONFLICT (source_message_id) DO NOTHING');
    expect(handoffCall[1]?.[2]).toBe('99');
  });

  it('repairs a missing handoff on replay without duplicating the source message', async () => {
    const database: QueryExecutor = {
      query: vi
        .fn()
        .mockResolvedValueOnce(
          queryResult([{ id: '1', phone_number: '6281234567890' }], 1)
        )
        .mockResolvedValueOnce(queryResult([], 0))
        .mockResolvedValueOnce(queryResult([{ id: '99' }], 1))
        .mockResolvedValueOnce(queryResult([], 0))
    } as unknown as QueryExecutor;
    const service = new MessageService(database);

    await expect(
      service.saveMessage({
        whatsappMessageId: 'provider-menu-5',
        whatsappJid: '6281234567890@s.whatsapp.net',
        direction: 'incoming',
        content: '5'
      })
    ).resolves.toEqual({ inserted: false });

    expect(database.query).toHaveBeenCalledTimes(4);
    expect(vi.mocked(database.query).mock.calls[3][0]).toContain(
      'ON CONFLICT (source_message_id) DO NOTHING'
    );
  });
});
