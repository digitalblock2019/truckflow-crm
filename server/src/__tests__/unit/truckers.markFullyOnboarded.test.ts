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

const TRUCKER_ROW = (overrides: Partial<any> = {}) => ({
  id: 'tr-1',
  mc_number: '1234567',
  legal_name: 'ACME TRUCKING',
  status_system: 'onboarded',
  uses_factoring: false,
  is_new_authority: false,
  uses_quick_pay: false,
  ...overrides,
});

describe('TruckersService.markFullyOnboarded — doc-completion guard', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  // The guard is the load-bearing rule here. Before this validator existed,
  // any UI path (or direct API call) could flip status_system='fully_onboarded'
  // without uploading the required onboarding docs.

  it('throws 400 when ALL 4 always-required docs are missing', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([TRUCKER_ROW()]))                  // initial SELECT trucker
      .mockResolvedValueOnce(ok([TRUCKER_ROW()]))                  // assertReadyForFullyOnboarded: flag SELECT
      .mockResolvedValueOnce(ok([                                   // assertReadyForFullyOnboarded: doc types
        { id: 'd1', label: 'MC Authority Letter', is_required: true, condition_flag: null },
        { id: 'd2', label: 'W-9 Form',            is_required: true, condition_flag: null },
        { id: 'd3', label: 'COI',                  is_required: true, condition_flag: null },
        { id: 'd4', label: 'Dispatcher Agreement', is_required: true, condition_flag: null },
      ]))
      .mockResolvedValueOnce(ok([]));                                // uploaded docs — empty

    await expect(svc.markFullyOnboarded('tr-1', 'user-1'))
      .rejects.toMatchObject({
        statusCode: 400,
        key: 'VALIDATION_ERROR',
        message: expect.stringContaining('missing required document(s)'),
      });
  });

  it('lists the specific missing doc labels in the error', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([TRUCKER_ROW()]))
      .mockResolvedValueOnce(ok([TRUCKER_ROW()]))
      .mockResolvedValueOnce(ok([
        { id: 'd1', label: 'MC Authority Letter', is_required: true, condition_flag: null },
        { id: 'd2', label: 'W-9 Form',            is_required: true, condition_flag: null },
      ]))
      .mockResolvedValueOnce(ok([{ document_type_id: 'd1' }])); // only MC letter uploaded

    await expect(svc.markFullyOnboarded('tr-1', 'user-1'))
      .rejects.toMatchObject({
        message: expect.stringContaining('W-9 Form'),
      });
  });

  it('treats conditional doc as required ONLY when its flag is TRUE', async () => {
    // uses_factoring=TRUE → NOA becomes required. No NOA uploaded → should fail.
    mockQuery
      .mockResolvedValueOnce(ok([TRUCKER_ROW({ uses_factoring: true })]))
      .mockResolvedValueOnce(ok([TRUCKER_ROW({ uses_factoring: true })]))
      .mockResolvedValueOnce(ok([
        { id: 'd1', label: 'MC Authority Letter', is_required: true, condition_flag: null },
        { id: 'noa', label: 'Notice of Assignment', is_required: false, condition_flag: 'uses_factoring' },
      ]))
      .mockResolvedValueOnce(ok([{ document_type_id: 'd1' }])); // MC uploaded, NOA missing

    await expect(svc.markFullyOnboarded('tr-1', 'user-1'))
      .rejects.toMatchObject({
        message: expect.stringContaining('Notice of Assignment'),
      });
  });

  it('IGNORES conditional doc when its flag is FALSE (does not require it)', async () => {
    // uses_factoring=FALSE → NOA hidden → not required → markFullyOnboarded proceeds.
    mockQuery
      .mockResolvedValueOnce(ok([TRUCKER_ROW({ uses_factoring: false })])) // initial SELECT
      .mockResolvedValueOnce(ok([TRUCKER_ROW({ uses_factoring: false })])) // flag SELECT
      .mockResolvedValueOnce(ok([
        { id: 'd1', label: 'MC Authority Letter', is_required: true, condition_flag: null },
        { id: 'noa', label: 'Notice of Assignment', is_required: false, condition_flag: 'uses_factoring' },
      ]))
      .mockResolvedValueOnce(ok([{ document_type_id: 'd1' }]))   // only MC uploaded, NOA missing but OK
      .mockResolvedValueOnce(ok([]))                              // UPDATE truckers
      .mockResolvedValueOnce(ok([]))                              // INSERT status_history
      .mockResolvedValueOnce(ok([]));                             // INSERT audit_log

    const result = await svc.markFullyOnboarded('tr-1', 'user-1');
    expect(result).toEqual({ message: 'Trucker marked as fully onboarded' });
  });

  it('throws 400 if NO document types are configured (vacuous-truth guard)', async () => {
    // The frontend check used [].every() which is vacuously true. The server
    // refuses to mark onboarded against an empty type list as a backstop.
    mockQuery
      .mockResolvedValueOnce(ok([TRUCKER_ROW()]))
      .mockResolvedValueOnce(ok([TRUCKER_ROW()]))
      .mockResolvedValueOnce(ok([])); // doc types — none configured

    await expect(svc.markFullyOnboarded('tr-1', 'user-1'))
      .rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('no document types are configured'),
      });
  });

  it('refuses if the trucker is already fully_onboarded', async () => {
    mockQuery.mockResolvedValueOnce(ok([TRUCKER_ROW({ status_system: 'fully_onboarded' })]));

    await expect(svc.markFullyOnboarded('tr-1', 'user-1'))
      .rejects.toMatchObject({
        statusCode: 400,
        message: 'Trucker is already fully onboarded',
      });
  });

  it('returns 404 when the trucker does not exist', async () => {
    mockQuery.mockResolvedValueOnce(ok([]));

    await expect(svc.markFullyOnboarded('ghost', 'user-1'))
      .rejects.toMatchObject({ statusCode: 404, key: 'NOT_FOUND' });
  });

  it('still succeeds when the post-UPDATE status_history insert errors (non-fatal)', async () => {
    // The UPDATE that flips status commits independently. If history/audit
    // inserts then fail, we don't 500 the request — status flip is already
    // committed and re-throwing would leave the caller convinced it failed
    // while the DB shows fully_onboarded. (This is what was happening in prod.)
    mockQuery
      .mockResolvedValueOnce(ok([TRUCKER_ROW()]))
      .mockResolvedValueOnce(ok([TRUCKER_ROW()]))
      .mockResolvedValueOnce(ok([
        { id: 'd1', label: 'MC', is_required: true, condition_flag: null },
      ]))
      .mockResolvedValueOnce(ok([{ document_type_id: 'd1' }]))
      .mockResolvedValueOnce(ok([]))                                              // UPDATE truckers — succeeds
      .mockRejectedValueOnce(new Error('relation "trucker_status_history" missing')) // status_history INSERT — fails
      .mockResolvedValueOnce(ok([]));                                             // audit_log INSERT — succeeds

    const result = await svc.markFullyOnboarded('tr-1', 'user-1');
    expect(result).toEqual({ message: 'Trucker marked as fully onboarded' });
  });
});

describe('TruckersService.update — fully_onboarded transition guard', () => {
  // Same validator must run on the generic update endpoint. Otherwise the
  // Truckers-page status dropdown could PATCH /api/truckers/:id with
  // status_system='fully_onboarded' and bypass the doc requirement entirely.
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('blocks status_system=fully_onboarded via update() when docs missing', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([TRUCKER_ROW({ status_system: 'onboarded' })])) // existing
      .mockResolvedValueOnce(ok([TRUCKER_ROW({ status_system: 'onboarded' })])) // assertReady: flags
      .mockResolvedValueOnce(ok([
        { id: 'd1', label: 'MC Authority Letter', is_required: true, condition_flag: null },
      ]))
      .mockResolvedValueOnce(ok([])); // no uploaded docs

    await expect(svc.update('tr-1', { status_system: 'fully_onboarded' }, 'user-1'))
      .rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('missing required document(s)'),
      });
  });

  it('does NOT run the guard for non-fully_onboarded status changes', async () => {
    // Switching to 'called' or 'interested' shouldn't trigger the doc check.
    mockQuery
      .mockResolvedValueOnce(ok([TRUCKER_ROW({ status_system: 'imported' })])) // existing
      .mockResolvedValueOnce(ok([]))                                            // status_history INSERT
      .mockResolvedValueOnce(ok([]))                                            // audit_log status_change INSERT
      .mockResolvedValueOnce(ok([]))                                            // employee lookup (auto-assign)
      .mockResolvedValueOnce(ok([]))                                            // UPDATE truckers
      .mockResolvedValueOnce(ok([{ id: 'tr-1' }]))                              // getById SELECT trucker
      .mockResolvedValueOnce(ok([]));                                           // getById commission threshold

    await svc.update('tr-1', { status_system: 'called' }, 'user-1');

    // No SELECT against trucker_document_types means the guard never ran
    const calledDocTypesQuery = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes('FROM trucker_document_types')
    );
    expect(calledDocTypesQuery).toBeUndefined();
  });
});
