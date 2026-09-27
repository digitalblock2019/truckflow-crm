import { test, expect } from '@playwright/test';
import { apiLogin, authHeaders, createTrucker, deleteTrucker, uniqueMc } from '../helpers';

const sheetRow = (mc: string, overrides: Record<string, string> = {}) => ({
  mc_number: mc,
  legal_name: `SHEET CARRIER ${mc}`,
  phone: '5559998888',
  email: 'sheet@example.com',
  state: 'TX',
  ...overrides,
});

test.describe('API — import target status', () => {
  let token: string;
  const created: string[] = [];

  test.beforeAll(async ({ request }) => {
    token = await apiLogin(request);
  });

  test.afterAll(async ({ request }) => {
    for (const id of created) await deleteTrucker(request, token, id);
  });

  async function findByMc(request: import('@playwright/test').APIRequestContext, mc: string) {
    const res = await request.get(`/api/truckers?search=${mc}`, { headers: authHeaders(token) });
    return (await res.json()).data.find((r: { mc_number: string }) => r.mc_number === mc);
  }

  test('defaults to imported when no target_status is given', async ({ request }) => {
    const mc = uniqueMc();
    const res = await request.post('/api/truckers/import', {
      headers: authHeaders(token),
      data: { rows: [sheetRow(mc)], filename: 'default.xlsx' },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).rows_added).toBeGreaterThan(0);

    const row = await findByMc(request, mc);
    created.push(row.id);
    expect(row.status_system).toBe('imported');
  });

  test('honours sleeping_lead and stamps the source file in history', async ({ request }) => {
    const mc = uniqueMc();
    const res = await request.post('/api/truckers/import', {
      headers: authHeaders(token),
      data: { rows: [sheetRow(mc)], filename: 'sleeping-sheet.xlsx', target_status: 'sleeping_lead' },
    });
    expect(res.ok()).toBeTruthy();

    const row = await findByMc(request, mc);
    created.push(row.id);
    expect(row.status_system).toBe('sleeping_lead');

    const history = await request.get(`/api/truckers/${row.id}/status-history`, {
      headers: authHeaders(token),
    });
    const rows = await history.json();
    expect(rows[0].comment).toContain('sleeping-sheet.xlsx');
  });

  test('rejects a target_status outside the whitelist', async ({ request }) => {
    // Guards against an import being used to skip the onboarding document
    // checklist by dropping rows straight into fully_onboarded.
    const res = await request.post('/api/truckers/import', {
      headers: authHeaders(token),
      data: { rows: [sheetRow(uniqueMc())], target_status: 'fully_onboarded' },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('API — import duplicate detection and resolution', () => {
  let token: string;
  const created: string[] = [];

  test.beforeAll(async ({ request }) => {
    token = await apiLogin(request);
  });

  test.afterAll(async ({ request }) => {
    for (const id of created) await deleteTrucker(request, token, id);
  });

  test('check-duplicates reports collisions and ignores unseen MC#s', async ({ request }) => {
    const existing = await createTrucker(request, token, { legal_name: 'CRM ORIGINAL' });
    created.push(existing.id);
    const freshMc = uniqueMc();

    const res = await request.post('/api/truckers/import/check-duplicates', {
      headers: authHeaders(token),
      data: { rows: [sheetRow(existing.mc_number), sheetRow(freshMc)] },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    expect(body.incoming_count).toBe(2);
    expect(body.duplicates).toHaveLength(1);
    expect(body.duplicates[0].mc_number).toBe(existing.mc_number);
    // Both sides must be present — the modal compares them field by field.
    expect(body.duplicates[0].crm.legal_name).toBe('CRM ORIGINAL');
    expect(body.duplicates[0].incoming.legal_name).toContain('SHEET CARRIER');
  });

  test('check-duplicates writes nothing', async ({ request }) => {
    const mc = uniqueMc();
    await request.post('/api/truckers/import/check-duplicates', {
      headers: authHeaders(token),
      data: { rows: [sheetRow(mc)] },
    });

    const res = await request.get(`/api/truckers?search=${mc}`, { headers: authHeaders(token) });
    expect((await res.json()).data).toHaveLength(0);
  });

  test('a duplicate with no resolution is skipped, leaving the record untouched', async ({ request }) => {
    const existing = await createTrucker(request, token, { legal_name: 'DO NOT TOUCH' });
    created.push(existing.id);

    const res = await request.post('/api/truckers/import', {
      headers: authHeaders(token),
      data: {
        rows: [sheetRow(existing.mc_number)],
        filename: 'sheet.xlsx',
        target_status: 'interested',
        resolutions: {},
      },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).rows_skipped).toBeGreaterThan(0);

    const detail = await request.get(`/api/truckers/${existing.id}`, { headers: authHeaders(token) });
    const body = await detail.json();
    expect(body.legal_name).toBe('DO NOT TOUCH');
    expect(body.status_system).not.toBe('interested');
  });

  test("resolution 'crm' moves status but keeps the CRM's field values", async ({ request }) => {
    const existing = await createTrucker(request, token, {
      legal_name: 'CRM WINS', phone: '5550001111',
    });
    created.push(existing.id);

    const res = await request.post('/api/truckers/import', {
      headers: authHeaders(token),
      data: {
        rows: [sheetRow(existing.mc_number)],
        filename: 'interested-sheet.xlsx',
        target_status: 'interested',
        resolutions: { [existing.mc_number]: 'crm' },
      },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).rows_updated).toBe(1);

    const body = await (await request.get(`/api/truckers/${existing.id}`, {
      headers: authHeaders(token),
    })).json();
    expect(body.status_system).toBe('interested');
    expect(body.legal_name).toBe('CRM WINS');
    expect(body.phone).toBe('5550001111');
  });

  test("resolution 'sheet' overwrites fields and moves status", async ({ request }) => {
    const existing = await createTrucker(request, token, {
      legal_name: 'STALE NAME', phone: '5550001111',
    });
    created.push(existing.id);

    await request.post('/api/truckers/import', {
      headers: authHeaders(token),
      data: {
        rows: [sheetRow(existing.mc_number, { legal_name: 'FRESH FROM SHEET' })],
        filename: 'interested-sheet.xlsx',
        target_status: 'interested',
        resolutions: { [existing.mc_number]: 'sheet' },
      },
    });

    const body = await (await request.get(`/api/truckers/${existing.id}`, {
      headers: authHeaders(token),
    })).json();
    expect(body.status_system).toBe('interested');
    expect(body.legal_name).toBe('FRESH FROM SHEET');
    expect(body.phone).toBe('5559998888');
  });

  test('blank sheet cells do not wipe existing CRM values', async ({ request }) => {
    const existing = await createTrucker(request, token, {
      legal_name: 'KEEP ME', phone: '5557654321', email: 'keep@example.com',
    });
    created.push(existing.id);

    await request.post('/api/truckers/import', {
      headers: authHeaders(token),
      data: {
        rows: [{ mc_number: existing.mc_number, legal_name: '', phone: '', email: '' }],
        filename: 'sparse.xlsx',
        target_status: 'interested',
        resolutions: { [existing.mc_number]: 'sheet' },
      },
    });

    const body = await (await request.get(`/api/truckers/${existing.id}`, {
      headers: authHeaders(token),
    })).json();
    expect(body.legal_name).toBe('KEEP ME');
    expect(body.phone).toBe('5557654321');
    expect(body.email).toBe('keep@example.com');
  });

  test('resolved duplicates get a history entry naming the source sheet', async ({ request }) => {
    const existing = await createTrucker(request, token);
    created.push(existing.id);

    await request.post('/api/truckers/import', {
      headers: authHeaders(token),
      data: {
        rows: [sheetRow(existing.mc_number)],
        filename: 'my-leads.xlsx',
        target_status: 'interested',
        resolutions: { [existing.mc_number]: 'crm' },
      },
    });

    const rows = await (await request.get(`/api/truckers/${existing.id}/status-history`, {
      headers: authHeaders(token),
    })).json();
    expect(rows[0].comment).toContain('my-leads.xlsx');
    expect(rows[0].comment).toContain('CRM');
  });
});
