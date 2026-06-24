import { TruckersService } from '../../services/truckers.service';
import * as db from '../../config/database';

jest.mock('../../config/database', () => ({
  query: jest.fn(),
}));
jest.mock('../../services/notifications.service', () => ({
  NotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn(), createForRole: jest.fn() })),
}));

const mockQuery = db.query as jest.MockedFunction<typeof db.query>;
const svc = new TruckersService();

const ok = (rows: any[]) => ({ rows, command: '', rowCount: rows.length, oid: 0, fields: [] }) as any;

// Regression: bulkDelete used to pass the literal string 'bulk' as
// audit_log.entity_id, which is UUID-typed. Postgres rejected the INSERT,
// causing a 500 even on otherwise-successful deletes. These tests pin the
// audit insert to a UUID-compatible value (NULL) and confirm that per-id
// failures are reported back to the caller instead of being swallowed.
describe('TruckersService.bulkDelete', () => {
  beforeEach(() => mockQuery.mockReset());

  it('passes NULL (not "bulk") as audit_log.entity_id', async () => {
    // 3 deletes succeed (status_history, thresholds, truckers) per id, then audit.
    mockQuery
      .mockResolvedValueOnce(ok([])).mockResolvedValueOnce(ok([])).mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([])); // audit_log

    await svc.bulkDelete(['tr-1'], 'admin-1');

    const calls = mockQuery.mock.calls;
    const auditCall = calls[calls.length - 1];
    const auditSql = String(auditCall[0]);
    // audit insert must hard-code NULL or pass null as the entity_id param.
    expect(auditSql).toMatch(/entity_id/);
    expect(auditSql).toMatch(/NULL/i);
    // And it must not pass the literal string 'bulk' as a parameter.
    expect(auditCall[1]).not.toContain('bulk');
  });

  it('reports per-id failures instead of silently dropping them', async () => {
    // First two delete attempts succeed; third (the truckers delete) throws.
    mockQuery
      .mockResolvedValueOnce(ok([])) // DELETE status_history
      .mockResolvedValueOnce(ok([])) // DELETE thresholds
      .mockRejectedValueOnce(Object.assign(new Error('update or delete on table "truckers" violates foreign key constraint "load_orders_trucker_id_fkey"'), {}))
      .mockResolvedValueOnce(ok([])); // audit_log

    const result = await svc.bulkDelete(['tr-1'], 'admin-1');

    expect(result.deleted).toBe(0);
    expect(result.requested).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].id).toBe('tr-1');
    expect(result.failures[0].reason).toMatch(/foreign key/);
  });

  it('does not propagate audit_log errors (delete succeeded — audit is best-effort)', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]))
      .mockRejectedValueOnce(new Error('audit_log offline'));

    // The function should still resolve with deleted=1 even when audit fails.
    await expect(svc.bulkDelete(['tr-1'], 'admin-1')).resolves.toMatchObject({ deleted: 1 });
  });

  it('returns the full counts so the UI can render partial-success messaging', async () => {
    // tr-1 succeeds, tr-2 fails on the truckers delete.
    mockQuery
      .mockResolvedValueOnce(ok([])).mockResolvedValueOnce(ok([])).mockResolvedValueOnce(ok([])) // tr-1 succeeds
      .mockResolvedValueOnce(ok([])).mockResolvedValueOnce(ok([])).mockRejectedValueOnce(new Error('fk fail')) // tr-2 fails
      .mockResolvedValueOnce(ok([])); // audit_log

    const result = await svc.bulkDelete(['tr-1', 'tr-2'], 'admin-1');

    expect(result).toMatchObject({ deleted: 1, requested: 2 });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].id).toBe('tr-2');
  });
});
