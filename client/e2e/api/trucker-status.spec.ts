import { test, expect } from '@playwright/test';
import { apiLogin, authHeaders, createTrucker, deleteTrucker } from '../helpers';

/**
 * The comment requirement is enforced in truckers.service.update(). Asserting
 * it here rather than only through the UI is the point: a disabled button
 * proves nothing about the rule, since anything holding a token can PATCH
 * directly.
 */
test.describe('API — status change comment gate', () => {
  let token: string;
  const created: string[] = [];

  test.beforeAll(async ({ request }) => {
    token = await apiLogin(request);
  });

  test.afterAll(async ({ request }) => {
    for (const id of created) await deleteTrucker(request, token, id);
  });

  test('rejects Interested without a comment', async ({ request }) => {
    const t = await createTrucker(request, token);
    created.push(t.id);

    const res = await request.patch(`/api/truckers/${t.id}`, {
      headers: authHeaders(token),
      data: { status_system: 'interested' },
    });

    expect(res.status()).toBe(400);
    // The error handler shapes failures as { error: { key, message } }.
    const body = await res.json();
    expect(body.error?.key).toBe('STATUS_COMMENT_REQUIRED');
  });

  test('rejects a whitespace-only comment', async ({ request }) => {
    const t = await createTrucker(request, token);
    created.push(t.id);

    const res = await request.patch(`/api/truckers/${t.id}`, {
      headers: authHeaders(token),
      data: { status_system: 'not_interested', status_comment: '   ' },
    });

    expect(res.status()).toBe(400);
  });

  test('accepts Interested with a comment and records it in history', async ({ request }) => {
    const t = await createTrucker(request, token);
    created.push(t.id);

    const res = await request.patch(`/api/truckers/${t.id}`, {
      headers: authHeaders(token),
      data: { status_system: 'interested', status_comment: 'Wants reefer loads FL to TX' },
    });
    expect(res.ok()).toBeTruthy();

    const history = await request.get(`/api/truckers/${t.id}/status-history`, {
      headers: authHeaders(token),
    });
    expect(history.ok()).toBeTruthy();
    const rows = await history.json();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].new_status_system).toBe('interested');
    expect(rows[0].comment).toBe('Wants reefer loads FL to TX');
    expect(rows[0].changed_by_name).toBeTruthy();
  });

  test('statuses outside the gated set do not require a comment', async ({ request }) => {
    const t = await createTrucker(request, token);
    created.push(t.id);

    const res = await request.patch(`/api/truckers/${t.id}`, {
      headers: authHeaders(token),
      data: { status_system: 'called' },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('sleeping_lead is settable and does not currently require a comment', async ({ request }) => {
    const t = await createTrucker(request, token);
    created.push(t.id);

    const res = await request.patch(`/api/truckers/${t.id}`, {
      headers: authHeaders(token),
      data: { status_system: 'sleeping_lead' },
    });
    expect(res.ok()).toBeTruthy();

    // If the team later adds sleeping_lead to COMMENT_REQUIRED_STATUSES this
    // test should flip to expecting 400 — it documents current scope, not an
    // argument that the scope is right.
    const detail = await request.get(`/api/truckers/${t.id}`, { headers: authHeaders(token) });
    expect((await detail.json()).status_system).toBe('sleeping_lead');
  });

  test('status_comment is not persisted onto the trucker row itself', async ({ request }) => {
    const t = await createTrucker(request, token);
    created.push(t.id);

    // Regression guard: status_comment must be stripped before the dynamic
    // UPDATE builds its SET list, or this 500s on an unknown column.
    const res = await request.patch(`/api/truckers/${t.id}`, {
      headers: authHeaders(token),
      data: { status_system: 'interested', status_comment: 'ok' },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).status_comment).toBeUndefined();
  });
});

test.describe('API — updated_by attribution', () => {
  let token: string;
  const created: string[] = [];

  test.beforeAll(async ({ request }) => {
    token = await apiLogin(request);
  });

  test.afterAll(async ({ request }) => {
    for (const id of created) await deleteTrucker(request, token, id);
  });

  test('any field edit records who made it, not just status changes', async ({ request }) => {
    const t = await createTrucker(request, token);
    created.push(t.id);

    const res = await request.patch(`/api/truckers/${t.id}`, {
      headers: authHeaders(token),
      data: { phone: '5551234567' },
    });
    expect(res.ok()).toBeTruthy();

    const detail = await request.get(`/api/truckers/${t.id}`, { headers: authHeaders(token) });
    const body = await detail.json();
    expect(body.updated_by).toBeTruthy();
    expect(body.updated_by_name).toBeTruthy();
    expect(body.updated_at).toBeTruthy();
  });

  test('list rows expose updated_by_name and latest_status_comment', async ({ request }) => {
    const t = await createTrucker(request, token);
    created.push(t.id);
    await request.patch(`/api/truckers/${t.id}`, {
      headers: authHeaders(token),
      data: { status_system: 'interested', status_comment: 'Listed comment check' },
    });

    const list = await request.get(`/api/truckers?search=${t.mc_number}`, {
      headers: authHeaders(token),
    });
    expect(list.ok()).toBeTruthy();
    const row = (await list.json()).data.find((r: { id: string }) => r.id === t.id);
    expect(row).toBeTruthy();
    expect(row.latest_status_comment).toBe('Listed comment check');
    expect(row.updated_by_name).toBeTruthy();
  });
});
