import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('Truckers — lead tracking UI', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/truckers');
    await expect(page.getByRole('heading', { name: /truckers/i }).first()).toBeVisible({ timeout: 10000 });
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

    await page.locator('select').filter({ hasText: 'Interested' }).first()
      .selectOption('interested').catch(async () => {
        // Fall back to the labelled select if the filter above doesn't match.
        await page.getByLabel('Change Status').selectOption('interested');
      });

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
