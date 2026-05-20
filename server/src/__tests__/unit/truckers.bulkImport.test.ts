import { TruckersService } from '../../services/truckers.service';
import * as db from '../../config/database';

jest.mock('../../config/database', () => ({
  query: jest.fn(),
}));

// notifications.service is fully mocked so createForRole() makes no DB calls —
// none of these tests need to queue mockQuery responses for the notification path.
const createForRole = jest.fn();
jest.mock('../../services/notifications.service', () => ({
  NotificationsService: jest.fn().mockImplementation(() => ({
    createForRole: (...args: any[]) => createForRole(...args),
  })),
}));

const mockQuery = db.query as jest.MockedFunction<typeof db.query>;
const svc = new TruckersService();

// pg.QueryResult-shaped helper so we don't repeat all the unused fields each time
const ok = (rows: any[]) => ({ rows, command: '', rowCount: rows.length, oid: 0, fields: [] }) as any;

const ROW = (mc: string) => ({
  mc_number: mc,
  dot_number: '1234',
  legal_name: `TRUCKER ${mc}`,
  dba_name: null,
  phone: '5551234',
  email: null,
  state: 'TX',
  physical_address: '1 Main St',
  power_units: '2',
});

describe('TruckersService.bulkImport — chunked-upload support', () => {
  beforeEach(() => {
    // mockReset clears both call history AND the queued mockResolvedValueOnce values.
    // clearAllMocks (the project default) only clears call history, which leaks
    // queued returns across tests.
    mockQuery.mockReset();
    createForRole.mockClear();
  });

  it('creates a new batch when no batch_id is passed and returns cumulative totals from the UPDATE', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ id: 'batch-1' }]))                                  // INSERT batch
      .mockResolvedValueOnce(ok([]))                                                    // dup check — not a dup
      .mockResolvedValueOnce(ok([]))                                                    // INSERT trucker
      .mockResolvedValueOnce(ok([{ rows_added: 1, rows_skipped: 0, rows_errored: 0 }])); // UPDATE batch totals

    const result = await svc.bulkImport([ROW('MC-1')], 'user-1', 'file.xlsx');

    expect(result).toEqual({
      batch_id: 'batch-1',
      rows_added: 1,
      rows_skipped: 0,
      rows_errored: 0,
    });
    expect(mockQuery.mock.calls[0][0]).toMatch(/INSERT INTO trucker_upload_batches/);
  });

  it('appends to an existing batch when batch_id is passed instead of creating a new one', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ id: 'batch-existing' }]))                               // batch verify
      .mockResolvedValueOnce(ok([{ id: 'existing-trucker' }]))                             // dup check — found, skipped
      .mockResolvedValueOnce(ok([{ rows_added: 100, rows_skipped: 1, rows_errored: 0 }])); // UPDATE cumulative

    // Note: MC# is now normalized to digits-only, so the fake MC must contain
    // digits — "MC-999" stores as "999" and still exercises the dup-skip path.
    const result = await svc.bulkImport(
      [ROW('MC-999')],
      'user-1',
      'file.xlsx',
      'batch-existing',
      false /* is_last_chunk */
    );

    expect(result).toEqual({
      batch_id: 'batch-existing',
      rows_added: 100,
      rows_skipped: 1,
      rows_errored: 0,
    });
    // Verify the service did NOT create a new batch row
    const insertedBatch = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO trucker_upload_batches')
    );
    expect(insertedBatch).toBeUndefined();
    // Verify it looked up the existing batch first
    expect(mockQuery.mock.calls[0][0]).toMatch(/SELECT id FROM trucker_upload_batches/);
  });

  it('throws 404 when the passed batch_id does not exist', async () => {
    mockQuery.mockResolvedValueOnce(ok([])); // verify returns no row

    await expect(
      svc.bulkImport([ROW('MC-1')], 'user-1', 'file.xlsx', 'ghost-batch-id', false)
    ).rejects.toMatchObject({ statusCode: 404, key: 'NOT_FOUND' });
  });

  it('does NOT fire admin/supervisor notifications on intermediate chunks (is_last_chunk=false)', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ id: 'batch-x' }]))
      .mockResolvedValueOnce(ok([]))                                                    // dup check
      .mockResolvedValueOnce(ok([]))                                                    // INSERT trucker
      .mockResolvedValueOnce(ok([{ rows_added: 1, rows_skipped: 0, rows_errored: 0 }])); // UPDATE

    await svc.bulkImport([ROW('MC-1')], 'user-1', 'file.xlsx', 'batch-x', false);

    expect(createForRole).not.toHaveBeenCalled();
  });

  it('fires admin AND supervisor notifications on the final chunk (is_last_chunk=true)', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ id: 'batch-x' }]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([{ rows_added: 5, rows_skipped: 0, rows_errored: 0 }]));

    await svc.bulkImport([ROW('MC-1')], 'user-1', 'file.xlsx', 'batch-x', true);

    // Two roles get notified: admin and supervisor
    expect(createForRole).toHaveBeenCalledTimes(2);
    const roles = createForRole.mock.calls.map((c) => c[0]).sort();
    expect(roles).toEqual(['admin', 'supervisor']);
  });

  it('counts duplicates as skipped, successes as added, and surfaces cumulative totals from the UPDATE RETURNING', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ id: 'batch-2' }]))                                        // INSERT batch
      .mockResolvedValueOnce(ok([{ id: 'existing' }]))                                       // row 1 dup
      .mockResolvedValueOnce(ok([]))                                                          // row 2 dup check — not a dup
      .mockResolvedValueOnce(ok([]))                                                          // row 2 INSERT
      .mockResolvedValueOnce(ok([{ rows_added: 1, rows_skipped: 1, rows_errored: 0 }]));     // UPDATE

    const result = await svc.bulkImport([ROW('MC-1'), ROW('MC-2')], 'user-1', 'file.xlsx');

    expect(result.rows_added).toBe(1);
    expect(result.rows_skipped).toBe(1);
    expect(result.rows_errored).toBe(0);
  });

  it('counts a failing INSERT as errored without aborting the rest of the chunk', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ id: 'batch-3' }]))                                       // INSERT batch
      .mockResolvedValueOnce(ok([]))                                                         // row 1 dup check
      .mockRejectedValueOnce(new Error('column too long'))                                   // row 1 INSERT — fails
      .mockResolvedValueOnce(ok([]))                                                         // row 2 dup check
      .mockResolvedValueOnce(ok([]))                                                         // row 2 INSERT — succeeds
      .mockResolvedValueOnce(ok([{ rows_added: 1, rows_skipped: 0, rows_errored: 1 }]));    // UPDATE

    const result = await svc.bulkImport([ROW('MC-1'), ROW('MC-2')], 'user-1', 'file.xlsx');

    expect(result.rows_added).toBe(1);
    expect(result.rows_errored).toBe(1);
  });
});
