import { TruckersService } from '../../services/truckers.service';
import * as db from '../../config/database';

jest.mock('../../config/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../services/notifications.service', () => ({
  NotificationsService: jest.fn().mockImplementation(() => ({
    create: jest.fn(),
    createForRole: jest.fn(),
  })),
}));

const mockQuery = db.query as jest.MockedFunction<typeof db.query>;
const svc = new TruckersService();

const ok = (rows: any[]) => ({ rows, command: '', rowCount: rows.length, oid: 0, fields: [] }) as any;

describe('TruckersService.create — MC#/DOT# digits-only normalization', () => {
  // Users were typing "MC-1234567" / "mc 1234567" into the Add Trucker form
  // which never matched scraper-format "1234567" and broke dup checks.

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('strips "MC-" prefix from mc_number on create', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([])) // dup check — clean
      .mockResolvedValueOnce(ok([{ id: 'tr-1', mc_number: '1234567' }])); // INSERT RETURNING

    await svc.create({ mc_number: 'MC-1234567', legal_name: 'Test' }, 'user-1');

    // The dup check should run with the cleaned digits, not the original
    expect(mockQuery.mock.calls[0][1]).toEqual(['1234567']);
    // INSERT should bind the cleaned value at position 1 (mc_number)
    const insertParams = mockQuery.mock.calls[1][1] as unknown[];
    expect(insertParams[0]).toBe('1234567');
  });

  it('strips spaces and lowercase letters from mc_number', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([{ id: 'tr-1' }]));

    await svc.create({ mc_number: 'mc 8309847', legal_name: 'Test' }, 'user-1');

    expect(mockQuery.mock.calls[0][1]).toEqual(['8309847']);
  });

  it('strips non-digits from dot_number too', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([{ id: 'tr-1' }]));

    await svc.create({ mc_number: '1234567', dot_number: 'DOT 7654321', legal_name: 'Test' }, 'user-1');

    const insertParams = mockQuery.mock.calls[1][1] as unknown[];
    // dot_number is the 2nd column in INSERT
    expect(insertParams[1]).toBe('7654321');
  });

  it('rejects with 400 when mc_number has no digits at all', async () => {
    await expect(svc.create({ mc_number: 'MC-', legal_name: 'Test' }, 'user-1'))
      .rejects.toMatchObject({
        statusCode: 400,
        key: 'VALIDATION_ERROR',
        message: expect.stringContaining('MC number must contain at least one digit'),
      });
  });

  it('rejects with 400 when mc_number is just letters', async () => {
    await expect(svc.create({ mc_number: 'ABCDEF', legal_name: 'Test' }, 'user-1'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('cleaned MC# is used for duplicate-check (so MC-1234567 collides with 1234567)', async () => {
    mockQuery.mockResolvedValueOnce(ok([{ id: 'existing-trucker', legal_name: 'Existing Co' }]));

    await expect(svc.create({ mc_number: 'MC-1234567', legal_name: 'Dupe' }, 'user-1'))
      .rejects.toMatchObject({
        statusCode: 409,
        key: 'DUPLICATE_MC',
      });

    // Confirm the dup check actually used the cleaned value
    expect(mockQuery.mock.calls[0][1]).toEqual(['1234567']);
  });

  it('DUPLICATE_MC error message includes the existing trucker\'s legal name', async () => {
    mockQuery.mockResolvedValueOnce(ok([{ id: 'existing-trucker', legal_name: 'Smith & Sons LLC' }]));

    await expect(svc.create({ mc_number: '1234567', legal_name: 'Dupe' }, 'user-1'))
      .rejects.toMatchObject({
        statusCode: 409,
        key: 'DUPLICATE_MC',
        message: expect.stringContaining('Smith & Sons LLC'),
      });
  });

  it('bypasses the duplicate-MC check when __force_duplicate_mc is true (insert is attempted)', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([])) // SELECT sibling for inheritance — none found
      .mockResolvedValueOnce(ok([{ id: 'tr-new', mc_number: '1234567', legal_name: 'Bob Smith' }])); // INSERT

    const result = await svc.create(
      { mc_number: '1234567', legal_name: 'Bob Smith', __force_duplicate_mc: true },
      'user-1',
    );

    expect(result).toMatchObject({ id: 'tr-new', mc_number: '1234567' });

    // The dup-check SELECT-by-legal-name must NOT be called anywhere in the run.
    const dupCheckCalled = mockQuery.mock.calls.find((c) =>
      /SELECT id, legal_name FROM truckers WHERE mc_number/i.test(String(c[0]))
    );
    expect(dupCheckCalled).toBeUndefined();
  });

  it('strips __force_duplicate_mc so it never reaches the INSERT payload', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([]))                    // SELECT sibling — none
      .mockResolvedValueOnce(ok([{ id: 'tr-new' }]));   // INSERT

    await svc.create(
      { mc_number: '1234567', legal_name: 'Bob Smith', __force_duplicate_mc: true },
      'user-1',
    );

    // Find the INSERT call (not the SELECT sibling) and check its params.
    const insertCall = mockQuery.mock.calls.find((c) =>
      /INSERT INTO truckers/i.test(String(c[0]))
    );
    expect(insertCall).toBeDefined();
    const insertParams = (insertCall?.[1] ?? []) as unknown[];
    expect(insertParams.some((p) => p === true)).toBe(false);
  });

  it('inherits sales agent + dispatcher from a same-MC sibling on duplicate-MC bypass', async () => {
    mockQuery
      // SELECT sibling — found, with both slots assigned
      .mockResolvedValueOnce(ok([{
        id: 'tr-sibling',
        assigned_sales_agent_id: 'sales-A',
        assigned_dispatcher_id:  'disp-B',
        assigned_agent_id:       'legacy-A',
      }]))
      // SELECT sibling thresholds — sales-A has a 5-load override; disp-B uses default
      .mockResolvedValueOnce(ok([
        { agent_employee_id: 'sales-A', threshold_loads: 5 },
      ]))
      // INSERT trucker
      .mockResolvedValueOnce(ok([{ id: 'tr-new' }]))
      // Threshold seeding loop: per-assignee
      .mockResolvedValueOnce(ok([{ value: '3' }]))    // SELECT system_settings default
      .mockResolvedValueOnce(ok([]))                  // INSERT threshold for legacy/sales (same set)
      .mockResolvedValueOnce(ok([]))                  // INSERT threshold #2
      .mockResolvedValueOnce(ok([]));                 // INSERT threshold #3 (if 3 distinct assignees)

    await svc.create(
      { mc_number: '1234567', legal_name: 'Sue Smith', __force_duplicate_mc: true },
      'actor-1',
    );

    const insertCall = mockQuery.mock.calls.find((c) =>
      /INSERT INTO truckers/i.test(String(c[0]))
    );
    const params = (insertCall?.[1] ?? []) as unknown[];
    // INSERT positional params per the create() SQL:
    //  25=assigned_agent_id, 26=assigned_sales_agent_id, 27=assigned_dispatcher_id (1-indexed in SQL = [24],[25],[26] in JS array).
    expect(params[24]).toBe('legacy-A');   // assigned_agent_id (legacy)
    expect(params[25]).toBe('sales-A');    // assigned_sales_agent_id inherited
    expect(params[26]).toBe('disp-B');     // assigned_dispatcher_id inherited
  });

  it('explicit form values win over inheritance on duplicate-MC bypass', async () => {
    mockQuery
      // SELECT sibling
      .mockResolvedValueOnce(ok([{
        id: 'tr-sibling',
        assigned_sales_agent_id: 'sales-A',
        assigned_dispatcher_id:  'disp-B',
        assigned_agent_id:       null,
      }]))
      .mockResolvedValueOnce(ok([])) // sibling thresholds — none
      .mockResolvedValueOnce(ok([{ id: 'tr-new' }])) // INSERT
      .mockResolvedValueOnce(ok([{ value: '3' }]))   // default lookup
      .mockResolvedValueOnce(ok([]))                 // threshold INSERT
      .mockResolvedValueOnce(ok([]));                // possible second

    await svc.create(
      {
        mc_number: '1234567',
        legal_name: 'Sue Smith',
        assigned_sales_agent_id: 'sales-EXPLICIT',  // explicit override
        __force_duplicate_mc: true,
      },
      'actor-1',
    );

    const insertCall = mockQuery.mock.calls.find((c) =>
      /INSERT INTO truckers/i.test(String(c[0]))
    );
    const params = (insertCall?.[1] ?? []) as unknown[];
    expect(params[25]).toBe('sales-EXPLICIT'); // explicit form value won
    expect(params[26]).toBe('disp-B');         // dispatcher inherited (no override)
  });

  it('inherits threshold_loads from the sibling row when seeding the new trucker', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{
        id: 'tr-sibling',
        assigned_sales_agent_id: 'sales-A',
        assigned_dispatcher_id:  null,
        assigned_agent_id:       null,
      }]))
      // Sibling has a custom 5-load threshold for sales-A
      .mockResolvedValueOnce(ok([
        { agent_employee_id: 'sales-A', threshold_loads: 5 },
      ]))
      .mockResolvedValueOnce(ok([{ id: 'tr-new' }])) // INSERT
      .mockResolvedValueOnce(ok([{ value: '3' }]))   // SELECT default — would be 3
      .mockResolvedValueOnce(ok([]));                // INSERT threshold

    await svc.create(
      { mc_number: '1234567', legal_name: 'Sue Smith', __force_duplicate_mc: true },
      'actor-1',
    );

    const thresholdInsert = mockQuery.mock.calls.find((c) =>
      /INSERT INTO agent_commission_thresholds/i.test(String(c[0]))
    );
    const params = (thresholdInsert?.[1] ?? []) as unknown[];
    // [trucker_id, agent_employee_id, threshold_loads, set_by]
    expect(params[1]).toBe('sales-A');
    expect(params[2]).toBe(5); // INHERITED 5 from sibling, not the default 3
  });

  it('falls back to default 3 when no same-MC sibling exists', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([])) // sibling not found
      .mockResolvedValueOnce(ok([{ id: 'tr-new' }]))
      .mockResolvedValueOnce(ok([])) // system_settings empty
      .mockResolvedValueOnce(ok([])); // INSERT threshold

    await svc.create(
      {
        mc_number: '1234567',
        legal_name: 'Bob Smith',
        assigned_sales_agent_id: 'sales-NEW',
        __force_duplicate_mc: true,
      },
      'actor-1',
    );

    const thresholdInsert = mockQuery.mock.calls.find((c) =>
      /INSERT INTO agent_commission_thresholds/i.test(String(c[0]))
    );
    const params = (thresholdInsert?.[1] ?? []) as unknown[];
    expect(params[2]).toBe(3); // default fallback
  });
});

describe('TruckersService.bulkImport — MC#/DOT# digits-only normalization', () => {
  // Same normalization on the bulk-import path so files exported with
  // "MC-..." values land cleanly without needing the one-off converter.

  beforeEach(() => {
    mockQuery.mockReset();
  });

  const importBatch = (rows: any[]) =>
    svc.bulkImport(rows, 'user-1', 'test.xlsx', undefined, false /* not last chunk */);

  it('strips MC- prefix on every imported row', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ id: 'batch-1' }]))                                  // INSERT batch
      .mockResolvedValueOnce(ok([]))                                                    // dup check — clean
      .mockResolvedValueOnce(ok([]))                                                    // INSERT trucker
      .mockResolvedValueOnce(ok([{ rows_added: 1, rows_skipped: 0, rows_errored: 0 }])); // UPDATE batch totals

    await importBatch([{
      mc_number: 'MC-1234567',
      legal_name: 'ACME',
    }]);

    // dup check call (2nd query) should use the cleaned MC
    expect(mockQuery.mock.calls[1][1]).toEqual(['1234567']);
    // INSERT (3rd query): 1st bind param is mc_number
    const insertParams = mockQuery.mock.calls[2][1] as unknown[];
    expect(insertParams[0]).toBe('1234567');
  });

  it('routes rows with no MC# digits to the errored count instead of failing the batch', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ id: 'batch-1' }])) // INSERT batch
      // row 1 ("MC-") has no digits → skipped before any query, no mock needed
      // row 2 ("9999999") is clean, runs dup check + insert
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([{ rows_added: 1, rows_skipped: 0, rows_errored: 1 }]));

    const result = await importBatch([
      { mc_number: 'MC-', legal_name: 'Bad' },
      { mc_number: '9999999', legal_name: 'Good' },
    ]);

    expect(result.rows_added).toBe(1);
    expect(result.rows_errored).toBe(1);
    expect(result.rows_skipped).toBe(0);
  });

  it('stores dot_number digits-only as well', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ id: 'batch-1' }]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([{ rows_added: 1, rows_skipped: 0, rows_errored: 0 }]));

    await importBatch([{
      mc_number: '1234567',
      dot_number: 'USDOT 7654321',
      legal_name: 'ACME',
    }]);

    const insertParams = mockQuery.mock.calls[2][1] as unknown[];
    expect(insertParams[1]).toBe('7654321');
  });
});
