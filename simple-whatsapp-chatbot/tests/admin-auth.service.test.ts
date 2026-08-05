import type { QueryResult, QueryResultRow } from 'pg';
import { rolePermissions } from '../src/auth/permissions.js';
import { verifyPassword } from '../src/auth/password.js';
import { AdminAuthService } from '../src/services/admin-auth.service.js';
import type { QueryExecutor } from '../src/services/message.service.js';

const queryResult = <Row extends QueryResultRow>(
  rows: Row[],
  rowCount = rows.length
): QueryResult<Row> => ({
  command: 'SELECT',
  rowCount,
  oid: 0,
  fields: [],
  rows
});

describe('AdminAuthService bootstrap accounts', () => {
  it('creates each missing bootstrap account with full admin permissions', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce(queryResult([], 0))
        .mockResolvedValueOnce(queryResult([], 1))
        .mockResolvedValueOnce(queryResult([], 0))
        .mockResolvedValueOnce(queryResult([], 1))
    } as unknown as QueryExecutor;
    const service = new AdminAuthService(database, { sessionTtlMs: 60_000 });

    await service.ensureBootstrapAdmins([
      {
        username: 'admin',
        password: 'admin123',
        displayName: 'Local Admin'
      },
      {
        username: 'superadmin',
        password: 'superadmin123',
        displayName: 'SUPERADMIN'
      }
    ]);

    expect(database.query).toHaveBeenCalledTimes(4);

    const adminInsert = vi.mocked(database.query).mock.calls[1];
    const superadminInsert = vi.mocked(database.query).mock.calls[3];

    expect(adminInsert[0]).toContain("VALUES ($1, $2, $3, $4, 'admin', $5)");
    expect(adminInsert[1]?.[1]).toBe('admin');
    expect(adminInsert[1]?.[2]).toBe('Local Admin');
    expect(JSON.parse(String(adminInsert[1]?.[4]))).toEqual(
      rolePermissions.admin
    );
    await expect(
      verifyPassword('admin123', String(adminInsert[1]?.[3]))
    ).resolves.toBe(true);

    expect(superadminInsert[1]?.[1]).toBe('superadmin');
    expect(superadminInsert[1]?.[2]).toBe('SUPERADMIN');
    expect(JSON.parse(String(superadminInsert[1]?.[4]))).toEqual(
      rolePermissions.admin
    );
    await expect(
      verifyPassword('superadmin123', String(superadminInsert[1]?.[3]))
    ).resolves.toBe(true);
  });

  it('does not overwrite an existing bootstrap account', async () => {
    const database = {
      query: vi.fn().mockResolvedValueOnce(queryResult([{ id: 'existing-id' }]))
    } as unknown as QueryExecutor;
    const service = new AdminAuthService(database, { sessionTtlMs: 60_000 });

    await service.ensureBootstrapAdmins([
      {
        username: 'superadmin',
        password: 'superadmin123',
        displayName: 'SUPERADMIN'
      }
    ]);

    expect(database.query).toHaveBeenCalledOnce();
    expect(database.query).toHaveBeenCalledWith(
      'SELECT id FROM admin_users WHERE username = $1 LIMIT 1;',
      ['superadmin']
    );
  });
});
