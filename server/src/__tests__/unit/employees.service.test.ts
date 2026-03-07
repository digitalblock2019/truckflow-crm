import { EmployeesService } from '../../services/employees.service';
import * as db from '../../config/database';

jest.mock('../../config/database', () => ({
  query: jest.fn(),
}));
jest.mock('../../services/email.service', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendWelcomeEmail: jest.fn(),
  })),
}));
jest.mock('../../services/notifications.service', () => ({
  NotificationsService: jest.fn().mockImplementation(() => ({
    createForRole: jest.fn(),
  })),
}));

const mockQuery = db.query as jest.MockedFunction<typeof db.query>;
const svc = new EmployeesService();

describe('EmployeesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('list() — dual-role filtering', () => {
    const setupListMock = () => {
      // count query
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }], command: '', rowCount: 1, oid: 0, fields: [] });
      // data query
      mockQuery.mockResolvedValueOnce({ rows: [{ id: '1' }, { id: '2' }], command: '', rowCount: 2, oid: 0, fields: [] });
    };

    it('includes sales_and_dispatcher when filtering by sales_agent', async () => {
      setupListMock();
      await svc.list({ type: 'sales_agent' });
      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain("IN ('sales_agent', 'sales_and_dispatcher')");
    });

    it('includes sales_and_dispatcher when filtering by dispatcher', async () => {
      setupListMock();
      await svc.list({ type: 'dispatcher' });
      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain("IN ('dispatcher', 'sales_and_dispatcher')");
    });

    it('uses exact match for other types', async () => {
      setupListMock();
      await svc.list({ type: 'fixed_salary' });
      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('e.employee_type = $1');
      expect(mockQuery.mock.calls[0][1]).toContain('fixed_salary');
    });

    it('returns paginated results', async () => {
      setupListMock();
      const result = await svc.list({ page: 2, limit: 10 });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(2);
    });
  });

  describe('getSalarySlips()', () => {
    it('returns monthly salary slips for an employee', async () => {
      // employee lookup
      mockQuery.mockResolvedValueOnce({
        rows: [{ base_salary_pkr_paisa: 5000000 }],
        command: '', rowCount: 1, oid: 0, fields: [],
      });
      // commissions grouped by month
      mockQuery.mockResolvedValueOnce({
        rows: [
          { month: '2026-01-01', total_commission_cents: 15000, total_commission_pkr_paisa: 4500000, load_count: 3 },
          { month: '2026-02-01', total_commission_cents: 22000, total_commission_pkr_paisa: 6600000, load_count: 5 },
        ],
        command: '', rowCount: 2, oid: 0, fields: [],
      });

      const result = await svc.getSalarySlips('e1', 2026);
      expect(result).toHaveLength(2);
      expect(result[0].base_salary_pkr_paisa).toBe(5000000);
      expect(result[0].total_commission_cents).toBe(15000);
      expect(result[0].load_count).toBe(3);
      expect(result[1].total_commission_cents).toBe(22000);
    });

    it('returns empty array when no commissions', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ base_salary_pkr_paisa: 5000000 }],
        command: '', rowCount: 1, oid: 0, fields: [],
      });
      mockQuery.mockResolvedValueOnce({ rows: [], command: '', rowCount: 0, oid: 0, fields: [] });

      const result = await svc.getSalarySlips('e1', 2026);
      expect(result).toHaveLength(0);
    });

    it('throws 404 for non-existent employee', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], command: '', rowCount: 0, oid: 0, fields: [] });
      await expect(svc.getSalarySlips('bad-id')).rejects.toThrow('Employee not found');
    });

    it('defaults to current year when no year provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ base_salary_pkr_paisa: 0 }],
        command: '', rowCount: 1, oid: 0, fields: [],
      });
      mockQuery.mockResolvedValueOnce({ rows: [], command: '', rowCount: 0, oid: 0, fields: [] });

      await svc.getSalarySlips('e1');
      const yearParam = mockQuery.mock.calls[1][1]![1];
      expect(yearParam).toBe(new Date().getFullYear());
    });
  });
});
