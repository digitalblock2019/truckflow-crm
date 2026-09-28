import { expect, type APIRequestContext, type Page } from '@playwright/test';

// Seeded by server/src/__tests__/globalSetup.ts when the test DB is built.
export const ADMIN = { email: 'admin@truckflow.com', password: 'Password123!' };

export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', ADMIN.email);
  await page.fill('input[type="password"]', ADMIN.password);
  await page.click('button[type="submit"]');
  // The post-login landing page isn't always "/" — assert we left /login
  // rather than pinning a destination that can legitimately change.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
}

/** Bearer token for API-level tests. */
export async function apiLogin(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/auth/login', { data: ADMIN });
  expect(res.ok(), `login failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return body.access_token;
}

export function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * MC numbers are globally unique and the importer normalises to digits-only,
 * so tests mint their own rather than sharing fixtures — otherwise a re-run
 * against a DB that wasn't torn down collides with itself.
 */
export function uniqueMc(): string {
  return String(Date.now()).slice(-9) + String(Math.floor(Math.random() * 90) + 10);
}

export async function createTrucker(
  request: APIRequestContext,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; mc_number: string }> {
  const mc = (overrides.mc_number as string) ?? uniqueMc();
  const res = await request.post('/api/truckers', {
    headers: authHeaders(token),
    data: { mc_number: mc, legal_name: `E2E Carrier ${mc}`, ...overrides },
  });
  expect(res.ok(), `create trucker failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return { id: body.id, mc_number: body.mc_number };
}

export async function deleteTrucker(request: APIRequestContext, token: string, id: string) {
  await request.delete(`/api/truckers/${id}`, { headers: authHeaders(token) });
}
