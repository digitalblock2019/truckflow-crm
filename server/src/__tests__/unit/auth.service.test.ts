import { AuthService } from '../../services/auth.service';
import * as db from '../../config/database';

jest.mock('../../config/database', () => ({
  query: jest.fn(),
}));

const mockQuery = db.query as jest.MockedFunction<typeof db.query>;
const authService = new AuthService();

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('me()', () => {
    it('returns user with employee details', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'u1',
          email: 'test@example.com',
          full_name: 'Test User',
          role: 'admin',
          employee_id: 'e1',
          is_active: true,
          last_login_at: null,
          created_at: '2026-01-01',
          employee_number: 'EMP-0001',
          job_title: 'Manager',
          department: 'Sales',
          employee_type: 'sales_agent',
          employment_status: 'active',
        }],
        command: '', rowCount: 1, oid: 0, fields: [],
      });

      const result = await authService.me('u1');
      expect(result.email).toBe('test@example.com');
      expect(result.full_name).toBe('Test User');
      expect(result.employee_number).toBe('EMP-0001');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('throws 404 for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], command: '', rowCount: 0, oid: 0, fields: [] });
      await expect(authService.me('bad-id')).rejects.toThrow('User not found');
    });
  });

  describe('updateProfile()', () => {
    it('updates user name and syncs to employee', async () => {
      // UPDATE users
      mockQuery.mockResolvedValueOnce({ rows: [], command: '', rowCount: 1, oid: 0, fields: [] });
      // SELECT employee_id
      mockQuery.mockResolvedValueOnce({
        rows: [{ employee_id: 'e1' }],
        command: '', rowCount: 1, oid: 0, fields: [],
      });
      // UPDATE employees
      mockQuery.mockResolvedValueOnce({ rows: [], command: '', rowCount: 1, oid: 0, fields: [] });
      // me() query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'u1', email: 'test@example.com', full_name: 'New Name', role: 'admin' }],
        command: '', rowCount: 1, oid: 0, fields: [],
      });

      const result = await authService.updateProfile('u1', { full_name: 'New Name' });
      expect(result.full_name).toBe('New Name');
      expect(mockQuery).toHaveBeenCalledTimes(4);
      // Verify users table updated
      expect(mockQuery.mock.calls[0][0]).toContain('UPDATE users SET full_name');
      // Verify employees table updated
      expect(mockQuery.mock.calls[2][0]).toContain('UPDATE employees SET full_name');
    });

    it('skips employee update when no employee_id linked', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], command: '', rowCount: 1, oid: 0, fields: [] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ employee_id: null }],
        command: '', rowCount: 1, oid: 0, fields: [],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'u1', full_name: 'Updated', email: 'x@x.com', role: 'admin' }],
        command: '', rowCount: 1, oid: 0, fields: [],
      });

      await authService.updateProfile('u1', { full_name: 'Updated' });
      // Should be 3 calls: update users, select employee_id, me() — no employee update
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('rejects empty name', async () => {
      await expect(authService.updateProfile('u1', { full_name: '' })).rejects.toThrow('Full name is required');
      await expect(authService.updateProfile('u1', { full_name: '   ' })).rejects.toThrow('Full name is required');
    });
  });

  describe('changePassword()', () => {
    it('throws when user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], command: '', rowCount: 0, oid: 0, fields: [] });
      await expect(authService.changePassword('bad', 'old', 'new12345')).rejects.toThrow('User not found');
    });
  });
});
