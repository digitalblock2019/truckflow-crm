import { test, expect } from '@playwright/test';
import { loginAsAdmin, apiLogin, createTrucker, authHeaders } from './helpers';

test.describe('Truckers — lead tracking UI', () => {
  // The grid tests need at least one row to click. The test database starts
  // empty, so seed through the API rather than assuming ambient data. The
  // Next.js dev server proxies /api to the backend, so relative paths work
  // from the ui project's baseURL.
  test.beforeEach(async ({ page, request }) => {
    const token = await apiLogin(request);
    const t = await createTrucker(request, token);
    // Two status changes so the history timeline has rows, one of them
    // carrying a comment. It has to END on a status other than Interested,
    // or selecting Interested below wouldn't be a change and the comment box
    // correctly wouldn't appear.
    await request.patch(`/api/truckers/${t.id}`, {
      headers: authHeaders(token),
      data: { status_system: 'interested', status_comment: 'Seeded for UI test' },
    });
    await request.patch(`/api/truckers/${t.id}`, {
      headers: authHeaders(token),
      data: { status_system: 'called' },
    });

    await loginAsAdmin(page);
    await page.goto('/truckers');
    await expect(page.getByRole('heading', { name: /truckers/i }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15000 });
  });

  test('subtabs render cold-to-hot with Not Interested before Interested', async ({ page }) => {
    const labels = await page.locator('[role="tab"], button').allInnerTexts();
    const joined = labels.join('|');

    for (const expected of ['Imported', 'Called / SMS Sent', 'Not Interested', 'Sleeping Leads', 'Interested']) {
      expect(joined, `missing tab: ${expected}`).toContain(expected);
    }

    // Order matters — the team asked for the declined/quiet outcomes to sit
    // between the call step and the positive path.
    const notInterested = joined.indexOf('Not Interested');
    const sleeping = joined.indexOf('Sleeping Leads');
    // "Interested" also appears inside "Not Interested", so search past it.
    const interested = joined.indexOf('Interested', notInterested + 'Not Interested'.length);
    expect(notInterested).toBeLessThan(sleeping);
    expect(sleeping).toBeLessThan(interested);
  });

  test('Sleeping Leads tab loads without error', async ({ page }) => {
    await page.getByText('Sleeping Leads', { exact: true }).click();
    // A broken enum value would surface as a failed request / error state
    // rather than an empty grid.
    await expect(page.locator('text=/error|failed/i')).toHaveCount(0);
  });

  test('list shows Last Comment and Last Updated columns', async ({ page }) => {
    await expect(page.getByText('Last Comment', { exact: true })).toBeVisible();
    await expect(page.getByText('Last Updated', { exact: true })).toBeVisible();
  });

  test('Interested requires a comment before the status can be saved', async ({ page }) => {
    // Open the first record in the grid.
    await page.locator('tbody tr').first().click();
    await expect(page.getByText('Change Status')).toBeVisible({ timeout: 10000 });

    // The Change Status label isn't tied to its select with htmlFor, so
    // identify it by the options it carries instead.
    const statusSelect = page
      .locator('select')
      .filter({ has: page.locator('option[value="interested"]') })
      .first();
    await statusSelect.selectOption('interested');

    const commentBox = page.locator('textarea');
    await expect(commentBox).toBeVisible();

    const updateBtn = page.getByRole('button', { name: /update status/i });
    await expect(updateBtn).toBeDisabled();

    await commentBox.fill('E2E: confirmed interest, wants dry van');
    await expect(updateBtn).toBeEnabled();
  });

  test('drawer shows a Status History section', async ({ page }) => {
    await page.locator('tbody tr').first().click();
    await expect(page.getByText('Status History')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Error surfacing', () => {
  // The API returns { error: { key, message } }. apiFetch used to read
  // body.message / body.code, so every real message was discarded and any
  // caller keying off the code — this duplicate-MC flow included — never
  // matched. Worth a test because the symptom is a generic error, not a crash.
  test('a duplicate MC number offers to add anyway instead of a generic error', async ({ page, request }) => {
    const token = await apiLogin(request);
    const existing = await createTrucker(request, token);

    await loginAsAdmin(page);
    await page.goto('/truckers');

    let dialogText = '';
    page.on('dialog', async (d) => { dialogText = d.message(); await d.dismiss(); });

    await page.getByRole('button', { name: /\+ Add Trucker/i }).click();
    await page.getByLabel('MC Number', { exact: true }).fill(existing.mc_number);
    await page.getByLabel('Legal Name', { exact: true }).fill('DUPLICATE ATTEMPT');
    await page.getByRole('button', { name: /^create trucker$/i }).click();

    // Proves the real server message reaches the user AND that the
    // DUPLICATE_MC code matched — before the apiFetch fix neither happened.
    await expect.poll(() => dialogText, { timeout: 10000 })
      .toMatch(/already exists.*Add this as a separate trucker/is);
  });
});

test.describe('Sidebar — CarriersVault', () => {
  test('admin sees the CarriersVault link pointing at the right URL', async ({ page }) => {
    await loginAsAdmin(page);
    const link = page.locator('a[href="https://carriersvault.com/login"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('target', '_blank');
    // Opening a third-party tab without noopener leaks window.opener.
    await expect(link).toHaveAttribute('rel', /noopener/);
  });
});
