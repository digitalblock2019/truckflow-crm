import request from 'supertest';
import app from '../../app';

let accessToken: string;
let refreshToken: string;

describe('Auth API Integration', () => {
  describe('POST /api/auth/login', () => {
    it('returns 401 for invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrongpass' });
      expect(res.status).toBe(401);
      expect(res.body.error.key).toBe('INVALID_CREDENTIALS');
    });

    it('returns 400 when email/password missing', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
    });

    it('logs in admin successfully', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@truckflow.com', password: 'Password123!' });
      expect(res.status).toBe(200);
      expect(res.body.access_token).toBeDefined();
      expect(res.body.refresh_token).toBeDefined();
      expect(res.body.user.email).toBe('admin@truckflow.com');
      accessToken = res.body.access_token;
      refreshToken = res.body.refresh_token;
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns user profile with token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('admin@truckflow.com');
      expect(res.body.role).toBe('admin');
    });
  });

  describe('PATCH /api/auth/me', () => {
    it('returns 401 without token', async () => {
      const res = await request(app)
        .patch('/api/auth/me')
        .send({ full_name: 'Hacker' });
      expect(res.status).toBe(401);
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('updates profile name', async () => {
      const res = await request(app)
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ full_name: 'Admin Updated' });
      expect(res.status).toBe(200);
      expect(res.body.full_name).toBe('Admin Updated');
    });

    it('reflects updated name on GET /me', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.body.full_name).toBe('Admin Updated');
    });

    // Restore original name
    afterAll(async () => {
      await request(app)
        .patch('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ full_name: 'Admin User' });
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('returns new access token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refresh_token: refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.access_token).toBeDefined();
    });

    it('rejects invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refresh_token: 'invalid-token' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('rejects wrong current password', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ current_password: 'wrong', new_password: 'newpass123' });
      expect(res.status).toBe(401);
    });

    it('rejects short new password', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ current_password: 'Password123!', new_password: 'short' });
      expect(res.status).toBe(400);
    });
  });
});
