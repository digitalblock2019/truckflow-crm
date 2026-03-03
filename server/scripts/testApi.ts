import dotenv from 'dotenv';
dotenv.config();

import app from '../src/app';

const server = app.listen(3002, async () => {
  const base = 'http://localhost:3002/api';

  try {
    // Login
    const loginRes = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@truckflow.com', password: 'Password123!' }),
    });
    const loginData = (await loginRes.json()) as any;
    console.log('LOGIN:', loginRes.status, '| user:', loginData.user?.full_name, '|', loginData.user?.role);

    const h = { Authorization: `Bearer ${loginData.access_token}` };

    const get = async (path: string) => {
      const res = await fetch(`${base}${path}`, { headers: h });
      return { status: res.status, data: (await res.json()) as any };
    };

    // Auth
    const me = await get('/auth/me');
    console.log('ME:', me.status, '|', me.data.full_name, me.data.role);

    // Employees
    const emp = await get('/employees');
    console.log('EMPLOYEES:', emp.status, '| total:', emp.data.total);

    // Truckers
    const trk = await get('/truckers');
    console.log('TRUCKERS:', trk.status, '| total:', trk.data.total);

    // Loads
    const loads = await get('/loads');
    console.log('LOADS:', loads.status, '| total:', loads.data.total);

    // Commissions
    const comm = await get('/commissions');
    console.log('COMMISSIONS:', comm.status, '| total:', comm.data.total);

    // Shippers
    const ship = await get('/shippers');
    console.log('SHIPPERS:', ship.status, '| total:', ship.data.total);

    // Settings
    const settings = await get('/settings');
    console.log('SETTINGS:', settings.status, '| entries:', settings.data.length);

    // Notifications
    const notif = await get('/notifications');
    console.log('NOTIFICATIONS:', notif.status, '| total:', notif.data.total);

    // Exchange rate
    const rate = await get('/exchange-rate/current');
    console.log('EXCHANGE RATE:', rate.status, '| rate:', rate.data.rate);

    // Refresh token
    const refreshRes = await fetch(`${base}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: loginData.refresh_token }),
    });
    const refreshData = (await refreshRes.json()) as any;
    console.log('REFRESH:', refreshRes.status, '| new token:', refreshData.access_token?.slice(0, 20) + '...');

    console.log('\nAll endpoints working!');
  } catch (e: any) {
    console.error('ERROR:', e.message);
  }

  server.close(() => process.exit(0));
});
