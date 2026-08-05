import type { QueryResult, QueryResultRow } from 'pg';
import type { QueryExecutor } from '../src/services/message.service.js';
import {
  TenantContextService
} from '../src/services/tenant-context.service.js';

const queryResult = <Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> => ({
  command: 'SELECT',
  rowCount: rows.length,
  oid: 0,
  fields: [],
  rows
});

describe('TenantContextService', () => {
  it('resolves the single active tenant from server-side membership', async () => {
    const database = {
      query: vi.fn(async () =>
        queryResult([
          {
            tenant_id: '00000000-0000-4000-8000-000000000001',
            slug: 'raho',
            name: 'RAHO',
            permissions: ['ai.settings.read', 'unknown.permission']
          }
        ])
      )
    } as unknown as QueryExecutor;
    const service = new TenantContextService(database);

    await expect(
      service.resolveForAdmin('2a99543d-80d5-47a0-92ef-a389ce1a3001')
    ).resolves.toEqual({
      tenantId: '00000000-0000-4000-8000-000000000001',
      slug: 'raho',
      name: 'RAHO',
      permissions: ['ai.settings.read']
    });
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('membership.admin_user_id = $1::uuid'),
      ['2a99543d-80d5-47a0-92ef-a389ce1a3001']
    );
  });

  it('rejects an Admin without an active membership', async () => {
    const database = {
      query: vi.fn(async () => queryResult([]))
    } as unknown as QueryExecutor;

    await expect(
      new TenantContextService(database).resolveForAdmin(
        '2a99543d-80d5-47a0-92ef-a389ce1a3001'
      )
    ).rejects.toMatchObject({
      code: 'TENANT_CONTEXT_UNRESOLVED'
    });
  });

  it('fails closed when more than one membership is active', async () => {
    const database = {
      query: vi.fn(async () =>
        queryResult([
          { tenant_id: 'a', slug: 'a', name: 'A', permissions: [] },
          { tenant_id: 'b', slug: 'b', name: 'B', permissions: [] }
        ])
      )
    } as unknown as QueryExecutor;

    await expect(
      new TenantContextService(database).resolveForAdmin(
        '2a99543d-80d5-47a0-92ef-a389ce1a3001'
      )
    ).rejects.toMatchObject({
      code: 'TENANT_CONTEXT_AMBIGUOUS'
    });
  });

  it('bootstraps memberships only for active admin roles', async () => {
    const database = { query: vi.fn(async () => queryResult([])) } as unknown as QueryExecutor;
    await new TenantContextService(database).ensureBootstrapTenant({
      tenantId: '00000000-0000-4000-8000-000000000001',
      slug: 'raho',
      name: 'RAHO'
    });

    expect(database.query).toHaveBeenCalledTimes(2);
    expect(vi.mocked(database.query).mock.calls[1]?.[0]).toContain(
      "users.role = 'admin'"
    );
  });
});
