import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('shows login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('rejects invalid login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'bad@example.com');
    await page.fill('input[type="password"]', 'wrongpass');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Invalid credentials')).toBeVisible({ timeout: 5000 });
  });

  test('logs in as admin', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@truckflow.com');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    // Should redirect to dashboard
    await expect(page).toHaveURL('/', { timeout: 10000 });
  });
});
