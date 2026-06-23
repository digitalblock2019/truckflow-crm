import { CommissionsService } from '../../services/commissions.service';
import * as db from '../../config/database';

jest.mock('../../config/database', () => ({
  query: jest.fn(),
}));

const mockQuery = db.query as jest.MockedFunction<typeof db.query>;
const svc = new CommissionsService();

const ok = (rows: any[]) => ({ rows, command: '', rowCount: rows.length, oid: 0, fields: [] }) as any;

// The Commissions page reads a specific set of fields from this endpoint to
// populate the formula bar (Gross / Carrier / Net / Rate / Commission) and
// the four stat cards (Pending / Approved / Paid / Total). If the backend
// shape drifts from that, every card silently renders $0.00. These tests
// lock the contract in place.
describe('CommissionsService.summary — Commissions page contract', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns the exact field set the page expects (lifetime + current_month)', async () => {
    mockQuery
      // totals (lifetime + month status breakdown)
      .mockResolvedValueOnce(ok([{
        total_pending_cents: '1000',
        total_approved_cents: '500',
        total_paid_cents: '300',
        total_commission_cents: '1800',
        count: 5,
        month_pending_cents: '400',
        month_approved_cents: '200',
        month_paid_cents: '100',
        month_commission_cents: '700',
        month_count: 2,
      }]))
      // load totals (gross / carrier / net)
      .mockResolvedValueOnce(ok([{
        total_gross_cents: '100000',
        total_carrier_cents: '95000',
        total_net_cents: '5000',
      }]));

    const result = await svc.summary({});

    expect(result).toEqual({
      total_pending_cents: 1000,
      total_approved_cents: 500,
      total_paid_cents: 300,
      total_commission_cents: 1800,
      total_gross_cents: 100000,
      total_carrier_cents: 95000,
      total_net_cents: 5000,
      avg_rate: 36, // 1800 / 5000 = 36.0%
      count: 5,
      current_month: {
        total_pending_cents: 400,
        total_approved_cents: 200,
        total_paid_cents: 100,
        total_commission_cents: 700,
        count: 2,
      },
    });
  });

  it('current_month filter is keyed off CURRENT_DATE (not a query param)', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{
        total_pending_cents: '0', total_approved_cents: '0',
        total_paid_cents: '0', total_commission_cents: '0', count: 0,
        month_pending_cents: '0', month_approved_cents: '0',
        month_paid_cents: '0', month_commission_cents: '0', month_count: 0,
      }]))
      .mockResolvedValueOnce(ok([{
        total_gross_cents: '0', total_carrier_cents: '0', total_net_cents: '0',
      }]));

    await svc.summary({});

    const totalsSql = String(mockQuery.mock.calls[0][0]);
    // Month overlay must reference CURRENT_DATE so the page auto-rolls over.
    expect(totalsSql).toMatch(/DATE_TRUNC\('month',\s*CURRENT_DATE\)/);
    // Lock that the month overlay covers all three statuses + total + count.
    expect(totalsSql).toMatch(/month_pending_cents/);
    expect(totalsSql).toMatch(/month_approved_cents/);
    expect(totalsSql).toMatch(/month_paid_cents/);
    expect(totalsSql).toMatch(/month_commission_cents/);
    expect(totalsSql).toMatch(/month_count/);
  });

  it('avg_rate is 0 when net revenue is 0 (no division-by-zero)', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{
        total_pending_cents: '0', total_approved_cents: '0',
        total_paid_cents: '0', total_commission_cents: '0', count: 0,
      }]))
      .mockResolvedValueOnce(ok([{
        total_gross_cents: '0', total_carrier_cents: '0', total_net_cents: '0',
      }]));

    const result = await svc.summary({});
    expect(result.avg_rate).toBe(0);
  });

  it('treats null SUM results as 0', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{
        total_pending_cents: null, total_approved_cents: null,
        total_paid_cents: null, total_commission_cents: null, count: 0,
      }]))
      .mockResolvedValueOnce(ok([{
        total_gross_cents: null, total_carrier_cents: null, total_net_cents: null,
      }]));

    const result = await svc.summary({});
    expect(result.total_pending_cents).toBe(0);
    expect(result.total_gross_cents).toBe(0);
    expect(result.avg_rate).toBe(0);
  });

  it('scopes by employee_id when passed (non-admin view)', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{
        total_pending_cents: '0', total_approved_cents: '0',
        total_paid_cents: '0', total_commission_cents: '0', count: 0,
      }]))
      .mockResolvedValueOnce(ok([{
        total_gross_cents: '0', total_carrier_cents: '0', total_net_cents: '0',
      }]));

    await svc.summary({ employee_id: 'emp-123' });

    // Both queries should include the employee_id parameter
    expect(mockQuery.mock.calls[0][1]).toContain('emp-123');
    expect(mockQuery.mock.calls[1][1]).toContain('emp-123');
    // And the WHERE clause should filter by employee_id
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/c\.employee_id\s*=/);
  });

  it('uses FILTER (WHERE ...) to break totals out by status in one query', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{
        total_pending_cents: '0', total_approved_cents: '0',
        total_paid_cents: '0', total_commission_cents: '0', count: 0,
      }]))
      .mockResolvedValueOnce(ok([{
        total_gross_cents: '0', total_carrier_cents: '0', total_net_cents: '0',
      }]));

    await svc.summary({});

    const totalsSql = String(mockQuery.mock.calls[0][0]);
    expect(totalsSql).toMatch(/FILTER\s*\(WHERE\s+c\.status\s*=\s*'pending'\)/);
    expect(totalsSql).toMatch(/FILTER\s*\(WHERE\s+c\.status\s*=\s*'approved'\)/);
    expect(totalsSql).toMatch(/FILTER\s*\(WHERE\s+c\.status\s*=\s*'paid'\)/);
  });

  it('de-duplicates loads when computing gross/carrier/net (one load, two commission rows)', async () => {
    mockQuery
      .mockResolvedValueOnce(ok([{
        total_pending_cents: '0', total_approved_cents: '0',
        total_paid_cents: '0', total_commission_cents: '0', count: 0,
      }]))
      .mockResolvedValueOnce(ok([{
        total_gross_cents: '0', total_carrier_cents: '0', total_net_cents: '0',
      }]));

    await svc.summary({});

    const loadSql = String(mockQuery.mock.calls[1][0]);
    expect(loadSql).toMatch(/SELECT DISTINCT lo\.id/);
  });
});
