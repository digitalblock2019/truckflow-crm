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

  // We had a real-world incident where two "Muhammad Sheraz" rows ended up
  // in employees (one with a trailing space, both with the same email)
  // because a second admin didn't notice the existing record. These tests
  // lock the dedupe + normalization rules so it can't repeat.
  describe('create() — duplicate prevention', () => {
    const ok = (rows: any[]) => ({ rows, command: '', rowCount: rows.length, oid: 0, fields: [] }) as any;

    it('rejects creating an employee whose personal_email is already taken', async () => {
      mockQuery.mockResolvedValueOnce(ok([
        { id: 'existing-1', full_name: 'Muhammad Sheraz', employee_number: 'EMP-0005' },
      ]));

      await expect(
        svc.create(
          { full_name: 'Muhammad Sheraz', personal_email: 'sherry@universaldispatchers.com', employee_type: 'sales_and_dispatcher' },
          'admin-1',
        ),
      ).rejects.toMatchObject({ statusCode: 409, key: 'EMPLOYEE_DUPLICATE_EMAIL' });
    });

    it('matches email case-insensitively (UPPER vs lower must collide)', async () => {
      mockQuery.mockResolvedValueOnce(ok([
        { id: 'existing-1', full_name: 'Some Person', employee_number: 'EMP-0001' },
      ]));

      await expect(
        svc.create(
          { full_name: 'Different Name', personal_email: 'SHERRY@UniversalDispatchers.com', employee_type: 'dispatcher' },
          'admin-1',
        ),
      ).rejects.toMatchObject({ key: 'EMPLOYEE_DUPLICATE_EMAIL' });

      // The lookup itself should have used the lowercased value.
      expect(mockQuery.mock.calls[0][1]).toContain('sherry@universaldispatchers.com');
    });

    it('trims whitespace off full_name so "Sheraz " and "Sheraz" can\'t both exist', async () => {
      // No duplicate found (empty email so no dedupe lookup), proceed.
      mockQuery
        .mockResolvedValueOnce(ok([])) // SELECT last employee_number (next num generation)
        .mockResolvedValueOnce(ok([{ id: 'new-1' }])) // INSERT
        .mockResolvedValueOnce(ok([])); // audit_log INSERT

      await svc.create(
        { full_name: '  Muhammad Sheraz  ', employee_type: 'dispatcher' },
        'admin-1',
      );

      // The INSERT params should carry the trimmed name.
      const insertParams = mockQuery.mock.calls[1][1] as any[];
      expect(insertParams[1]).toBe('Muhammad Sheraz');
    });

    it('treats empty personal_email as null and skips the dedupe lookup', async () => {
      mockQuery
        .mockResolvedValueOnce(ok([])) // SELECT last employee_number
        .mockResolvedValueOnce(ok([{ id: 'new-1' }])) // INSERT
        .mockResolvedValueOnce(ok([])); // audit_log

      await svc.create(
        { full_name: 'No Email Person', personal_email: '   ', employee_type: 'dispatcher' },
        'admin-1',
      );

      // First call must be the EMP-number lookup, NOT a dedupe SELECT on personal_email.
      const firstSql = String(mockQuery.mock.calls[0][0]);
      expect(firstSql).toMatch(/employee_number/);
      expect(firstSql).not.toMatch(/LOWER\(personal_email\)/);
    });
  });
});
