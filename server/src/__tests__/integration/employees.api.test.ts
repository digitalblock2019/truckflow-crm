import request from 'supertest';
import app from '../../app';
import { query } from '../../config/database';

let accessToken: string;
let createdEmployeeId: string;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@truckflow.com', password: 'Password123!' });
  accessToken = res.body.access_token;
});

// Clean up test employee after all tests
afterAll(async () => {
  if (createdEmployeeId) {
    try {
      await query('DELETE FROM agent_commission_thresholds WHERE agent_employee_id = $1', [createdEmployeeId]);
      await query('DELETE FROM commissions WHERE employee_id = $1', [createdEmployeeId]);
      await query('DELETE FROM employee_leave_requests WHERE employee_id = $1', [createdEmployeeId]);
      await query('DELETE FROM employee_pay_history WHERE employee_id = $1', [createdEmployeeId]);
      await query('DELETE FROM employee_bank_details WHERE employee_id = $1', [createdEmployeeId]);
      await query('DELETE FROM notifications WHERE entity_id = $1', [createdEmployeeId]);
      await query('DELETE FROM audit_log WHERE entity_id = $1', [createdEmployeeId]);
      await query('DELETE FROM users WHERE employee_id = $1', [createdEmployeeId]);
      await query('DELETE FROM employees WHERE id = $1', [createdEmployeeId]);
    } catch (err) {
      console.warn('Test cleanup error:', err);
    }
  }
});

describe('Employees API Integration', () => {
  describe('POST /api/employees', () => {
    it('creates a sales_agent employee', async () => {
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          full_name: 'Test Sales Agent',
          employee_type: 'sales_agent',
          personal_email: 'testagent@example.com',
          pay_type: 'commission_only',
          commission_type: 'percentage',
          commission_value: 10,
        });
      expect(res.status).toBe(201);
      expect(res.body.full_name).toBe('Test Sales Agent');
      expect(res.body.employee_type).toBe('sales_agent');
      createdEmployeeId = res.body.id;
    });

    it('rejects without full_name', async () => {
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ employee_type: 'dispatcher' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/employees', () => {
    it('lists employees', async () => {
      const res = await request(app)
        .get('/api/employees')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
    });

    it('filters by type', async () => {
      const res = await request(app)
        .get('/api/employees?type=sales_agent')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      res.body.data.forEach((emp: any) => {
        expect(['sales_agent', 'sales_and_dispatcher']).toContain(emp.employee_type);
      });
    });

    it('searches by name', async () => {
      const res = await request(app)
        .get('/api/employees?search=Test Sales')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/employees/:id', () => {
    it('gets employee by ID', async () => {
      const res = await request(app)
        .get(`/api/employees/${createdEmployeeId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.full_name).toBe('Test Sales Agent');
    });

    it('returns 404 for non-existent ID', async () => {
      const res = await request(app)
        .get('/api/employees/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/employees/:id', () => {
    it('updates employee fields', async () => {
      const res = await request(app)
        .patch(`/api/employees/${createdEmployeeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ job_title: 'Senior Agent', department: 'Sales' });
      expect(res.status).toBe(200);
      expect(res.body.job_title).toBe('Senior Agent');
    });
  });

  describe('GET /api/employees/me/salary-slips', () => {
    it('returns salary slips (may be empty for admin with no employee)', async () => {
      const res = await request(app)
        .get('/api/employees/me/salary-slips?year=2026')
        .set('Authorization', `Bearer ${accessToken}`);
      // Admin may not have an employee record, so 404 is acceptable
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toBeInstanceOf(Array);
      }
    });
  });

  describe('GET /api/employees/:id/salary-slips', () => {
    it('returns salary slips for specific employee', async () => {
      const res = await request(app)
        .get(`/api/employees/${createdEmployeeId}/salary-slips?year=2026`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
    });
  });
});
