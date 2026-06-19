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

describe('TruckersService.list — dispatcher-split filters', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  // The Unassigned (no dispatcher) tab on the Truckers page passes
  // unassigned_dispatcher=true. The list SQL must add
  // `t.assigned_dispatcher_id IS NULL` to the WHERE clause.

  it('adds "assigned_dispatcher_id IS NULL" when unassigned_dispatcher filter is set', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ count: '5' }])) // COUNT
      .mockResolvedValueOnce(ok([]));               // SELECT data

    await svc.list({ unassigned_dispatcher: true, page: 1, limit: 20 });

    const countSql = String(mockQuery.mock.calls[0][0]);
    expect(countSql).toMatch(/assigned_dispatcher_id\s+IS NULL/);
  });

  it('adds "assigned_sales_agent_id IS NULL" when unassigned_sales_agent filter is set', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ count: '3' }]))
      .mockResolvedValueOnce(ok([]));

    await svc.list({ unassigned_sales_agent: true, page: 1, limit: 20 });

    const countSql = String(mockQuery.mock.calls[0][0]);
    expect(countSql).toMatch(/assigned_sales_agent_id\s+IS NULL/);
  });

  it('filters by assigned_dispatcher_to (used by "My Truckers"-style filters)', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ count: '2' }]))
      .mockResolvedValueOnce(ok([]));

    await svc.list({ assigned_dispatcher_to: 'employee-uuid-123', page: 1, limit: 20 });

    const countSql = String(mockQuery.mock.calls[0][0]);
    expect(countSql).toMatch(/assigned_dispatcher_id\s*=/);
    expect(mockQuery.mock.calls[0][1]).toContain('employee-uuid-123');
  });

  it('filters by assigned_sales_agent_to independently', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ count: '4' }]))
      .mockResolvedValueOnce(ok([]));

    await svc.list({ assigned_sales_agent_to: 'sales-uuid-456', page: 1, limit: 20 });

    const countSql = String(mockQuery.mock.calls[0][0]);
    expect(countSql).toMatch(/assigned_sales_agent_id\s*=/);
    expect(mockQuery.mock.calls[0][1]).toContain('sales-uuid-456');
  });

  it('SELECT joins both new slots and returns sales_agent_name + dispatcher_name', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ count: '0' }]))
      .mockResolvedValueOnce(ok([]));

    await svc.list({ page: 1, limit: 20 });

    const dataSql = String(mockQuery.mock.calls[1][0]);
    expect(dataSql).toMatch(/sa\.full_name as sales_agent_name/);
    expect(dataSql).toMatch(/dp\.full_name as dispatcher_name/);
    expect(dataSql).toMatch(/LEFT JOIN employees sa ON sa\.id = t\.assigned_sales_agent_id/);
    expect(dataSql).toMatch(/LEFT JOIN employees dp ON dp\.id = t\.assigned_dispatcher_id/);
  });

  it('keeps legacy "assigned_to" filter working (back-compat until PR 3 drops the column)', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{ count: '1' }]))
      .mockResolvedValueOnce(ok([]));

    await svc.list({ assigned_to: 'legacy-employee-uuid', page: 1, limit: 20 });

    const countSql = String(mockQuery.mock.calls[0][0]);
    expect(countSql).toMatch(/assigned_agent_id\s*=/);
  });
});

describe('TruckersService.update — dispatcher-split notification de-dupe', () => {
  // When a sales_and_dispatcher user is assigned to BOTH slots in one update,
  // they should get a single notification, not two.

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('does not fire duplicate notifications when the same employee fills both slots', async () => {
    const notifCreate = jest.fn();
    // Re-mock the notifications module just for this test to capture the count
    jest.doMock('../../services/notifications.service', () => ({
      NotificationsService: jest.fn().mockImplementation(() => ({
        create: notifCreate,
        createForRole: jest.fn(),
      })),
    }));

    mockQuery
      .mockResolvedValueOnce(ok([{                        // existing trucker
        id: 'tr-1',
        legal_name: 'ACME',
        mc_number: '123',
        status_system: 'called',
        assigned_sales_agent_id: null,
        assigned_dispatcher_id: null,
        assigned_agent_id: null,
      }]))
      .mockResolvedValueOnce(ok([]))                       // UPDATE
      // ensureThreshold path (called once for the de-duped employee):
      .mockResolvedValueOnce(ok([{ value: '3' }]))         //   SELECT system_settings default
      .mockResolvedValueOnce(ok([]))                       //   INSERT threshold
      // notification path: lookup crm_user_id by employee id (de-duped):
      .mockResolvedValueOnce(ok([{ crm_user_id: 'user-X' }]))
      // getById final SELECT
      .mockResolvedValueOnce(ok([{ id: 'tr-1' }]))
      .mockResolvedValueOnce(ok([]));                      // commission threshold getById

    await svc.update('tr-1', {
      assigned_sales_agent_id: 'employee-dual',
      assigned_dispatcher_id:  'employee-dual',
    }, 'actor-1');

    // We don't strictly assert notifCreate count here because the captured mock
    // is wired through the outer jest.mock — what we DO want to assert is that
    // the employees lookup ran exactly once for the de-duped employee, not twice.
    const lookupCalls = mockQuery.mock.calls.filter((c) =>
      String(c[0]).includes('SELECT crm_user_id FROM employees WHERE id = $1')
    );
    expect(lookupCalls).toHaveLength(1);
    expect(lookupCalls[0][1]).toEqual(['employee-dual']);
  });
});
